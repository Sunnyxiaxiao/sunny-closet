-- Sunny Closet：头盔套（装饰配件）
--
-- 1) 头盔套也是一个“款式”（styles.category = 'helmet_cover'），库存、排期、防超订全部沿用原来的表和约束。
--    新增字段：档位 tier（regular / premium）、标签 tags、搭配加购价、重置价值、单独的价目表。
--    styles.rental_prices_cents 不为空时，这个款式按自己的价目表计价，否则用 settings 里的全店价目表。
-- 2) 搭配雪服加购：加购的头盔套是一笔“子订单”（bookings.parent_booking_id 指向雪服订单），
--    日期与雪服相同，租金为固定的加购价，不按天数计算。主订单改状态时，子订单自动跟着改。
-- 3) 后台手动锁定日期：inventory_blocks，锁定期间这件库存不可被预订。

-- ---------------------------------------------------------------------------
-- 款式：头盔套字段
-- ---------------------------------------------------------------------------
alter table public.styles drop constraint styles_category_check;

alter table public.styles
  add constraint styles_category_check
    check (category in ('suit', 'one_piece', 'jacket', 'pants', 'helmet_cover')),
  add column tier text check (tier in ('regular', 'premium')),
  add column tags text[] not null default '{}',
  add column addon_price_cents integer check (addon_price_cents >= 0),
  add column replacement_value_cents integer check (replacement_value_cents >= 0),
  add column rental_prices_cents integer[],
  add constraint styles_rental_prices_valid check (
    rental_prices_cents is null or (
      array_length(rental_prices_cents, 1) between 1 and 31
      and array_position(rental_prices_cents, null) is null
      and 0 <= all (rental_prices_cents)
    )
  ),
  add constraint styles_helmet_cover_fields check (
    category <> 'helmet_cover'
    or (tier is not null and addon_price_cents is not null and rental_prices_cents is not null)
  );

-- 某个款式租 p_days 天的租金：优先用款式自己的价目表
create or replace function public.style_rental_price_cents(p_style_id uuid, p_days integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select p.prices[least(p_days, array_length(p.prices, 1))]
  from (
    select coalesce(st.rental_prices_cents, s.rental_prices_cents) as prices
    from public.styles st
    cross join public.settings s
    where st.id = p_style_id and s.id
  ) p
  where p_days >= 1;
$$;

-- ---------------------------------------------------------------------------
-- 手动锁定日期
-- ---------------------------------------------------------------------------
create table public.inventory_blocks (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  blocked_range daterange generated always as (daterange(start_date, end_date + 1, '[)')) stored,
  created_at timestamptz not null default now(),
  constraint inventory_blocks_dates_valid check (end_date >= start_date)
);

create index inventory_blocks_item_idx on public.inventory_blocks using gist (inventory_item_id, blocked_range);

alter table public.inventory_blocks enable row level security;
revoke all on table public.inventory_blocks from anon, authenticated;
grant select, insert, delete on public.inventory_blocks to authenticated;
grant all on table public.inventory_blocks to service_role;

create policy inventory_blocks_admin_select on public.inventory_blocks
  for select to authenticated using (public.is_admin());
create policy inventory_blocks_admin_insert on public.inventory_blocks
  for insert to authenticated with check (public.is_admin());
create policy inventory_blocks_admin_delete on public.inventory_blocks
  for delete to authenticated using (public.is_admin());

-- 某件库存在占用区间 p_range 内是否空闲（没有占用中的订单，也没有被手动锁定）
create or replace function public.is_item_free(p_item_id uuid, p_range daterange)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
      select 1 from public.bookings b
      where b.inventory_item_id = p_item_id
        and public.is_blocking_status(b.status)
        and b.blocked_range && p_range
    )
    and not exists (
      select 1 from public.inventory_blocks k
      where k.inventory_item_id = p_item_id
        and k.blocked_range && p_range
    );
$$;

-- ---------------------------------------------------------------------------
-- 订单：加购子订单
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column parent_booking_id uuid references public.bookings (id) on delete restrict,
  add constraint bookings_parent_not_self check (parent_booking_id is null or parent_booking_id <> id);

create index bookings_parent_idx on public.bookings (parent_booking_id) where parent_booking_id is not null;

-- 主订单改状态时，仍和主订单处于同一状态的加购子订单跟着改
create or replace function public.sync_addon_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings
  set status = new.status
  where parent_booking_id = new.id
    and status = old.status;
  return new;
end;
$$;

create trigger bookings_sync_addon_status
  after update of status on public.bookings
  for each row
  when (new.parent_booking_id is null and old.status is distinct from new.status)
  execute function public.sync_addon_status();

-- ---------------------------------------------------------------------------
-- 可用性查询：额外排除手动锁定的日期
-- ---------------------------------------------------------------------------
create or replace function public.get_availability(
  p_start date default null,
  p_end date default null,
  p_style_id uuid default null
)
returns table (style_id uuid, size text, total_count integer, available_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_buffer integer;
  v_range daterange;
begin
  if (p_start is null) <> (p_end is null) then
    raise exception 'start and end must both be provided' using errcode = '22023';
  end if;

  if p_start is not null then
    if p_end < p_start then
      raise exception 'end date before start date' using errcode = '22023';
    end if;
    select s.buffer_days into v_buffer from public.settings s where s.id;
    v_range := daterange(p_start, p_end + 1 + coalesce(v_buffer, 0), '[)');
  end if;

  return query
  select
    i.style_id,
    i.size,
    count(*)::integer as total_count,
    count(*) filter (where v_range is null or public.is_item_free(i.id, v_range))::integer as available_count
  from public.inventory_items i
  join public.styles st on st.id = i.style_id
  where i.status = 'available'
    and st.is_active
    and (p_style_id is null or i.style_id = p_style_id)
  group by i.style_id, i.size;
end;
$$;

-- ---------------------------------------------------------------------------
-- 分配一件空闲库存并写入一行订单（create_booking 内部使用）
-- 并发安全仍由 bookings_no_overlap 排他约束保证：抢到同一件时换下一件。
-- ---------------------------------------------------------------------------
create or replace function public.insert_booking_row(
  p_booking_no text,
  p_parent_booking_id uuid,
  p_style_id uuid,
  p_size text,
  p_start date,
  p_end date,
  p_buffer_days integer,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_shipping_address text,
  p_customer_note text,
  p_daily_price_cents integer,
  p_rental_cents integer,
  p_deposit_cents integer
)
returns table (booking_id uuid, inventory_item_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_range daterange := daterange(p_start, p_end + 1 + p_buffer_days, '[)');
  v_item_id uuid;
  v_booking_id uuid;
begin
  for v_item_id in
    select i.id
    from public.inventory_items i
    where i.style_id = p_style_id
      and (p_size is null or i.size = p_size)
      and i.status = 'available'
      and public.is_item_free(i.id, v_range)
    order by i.code
  loop
    begin
      insert into public.bookings (
        booking_no, parent_booking_id, style_id, inventory_item_id, size,
        start_date, end_date, buffer_days, status,
        fulfillment_method, shipping_address,
        customer_name, customer_email, customer_phone, customer_note,
        rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
      )
      select
        p_booking_no, p_parent_booking_id, p_style_id, v_item_id, i.size,
        p_start, p_end, p_buffer_days, 'pending',
        p_fulfillment_method, nullif(trim(coalesce(p_shipping_address, '')), ''),
        trim(p_customer_name), lower(trim(p_customer_email)), trim(p_customer_phone),
        coalesce(p_customer_note, ''),
        p_end - p_start + 1, p_daily_price_cents, p_rental_cents, p_deposit_cents,
        p_rental_cents + p_deposit_cents
      from public.inventory_items i
      where i.id = v_item_id
      returning id into v_booking_id;

      booking_id := v_booking_id;
      inventory_item_id := v_item_id;
      return next;
      return;
    exception
      when exclusion_violation then
        null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 创建预订（雪服或单租头盔套），可附带加购的头盔套
-- p_addon_style_ids / p_addon_cents：加购款式和服务端算好的加购价，一一对应
-- ---------------------------------------------------------------------------
drop function public.create_booking(
  uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer
);

create function public.create_booking(
  p_style_id uuid,
  p_size text,
  p_start date,
  p_end date,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_shipping_address text,
  p_customer_note text,
  p_daily_price_cents integer,
  p_rental_cents integer,
  p_deposit_cents integer,
  p_addon_style_ids uuid[] default '{}',
  p_addon_cents integer[] default '{}'
)
returns table (booking_id uuid, booking_no text, inventory_item_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_settings public.settings%rowtype;
  v_style public.styles%rowtype;
  v_addon public.styles%rowtype;
  v_booking_no text := public.generate_booking_no();
  v_main record;
  v_child record;
  v_days integer;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  v_days := p_end - p_start + 1;

  select * into v_settings from public.settings s where s.id;

  if v_days > v_settings.max_rental_days then
    raise exception 'rental_too_long' using errcode = 'P0001';
  end if;

  if p_fulfillment_method = 'shipping' and v_days < v_settings.shipping_min_days then
    raise exception 'shipping_min_days' using errcode = 'P0001';
  end if;

  select * into v_style from public.styles s where s.id = p_style_id and s.is_active;
  if not found then
    raise exception 'style_not_found' using errcode = 'P0001';
  end if;

  if p_rental_cents <> public.style_rental_price_cents(p_style_id, v_days)
     or p_deposit_cents <> v_style.deposit_cents then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

  if coalesce(array_length(p_addon_style_ids, 1), 0) <> coalesce(array_length(p_addon_cents, 1), 0) then
    raise exception 'invalid_addons' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_addon_style_ids, 1), 0) > 0 and v_style.category = 'helmet_cover' then
    raise exception 'invalid_addons' using errcode = 'P0001';
  end if;

  select * into v_main from public.insert_booking_row(
    v_booking_no, null, p_style_id, p_size, p_start, p_end, v_settings.buffer_days,
    p_customer_name, p_customer_email, p_customer_phone,
    p_fulfillment_method, p_shipping_address, p_customer_note,
    p_daily_price_cents, p_rental_cents, p_deposit_cents
  );
  if not found then
    raise exception 'no_availability' using errcode = 'P0001';
  end if;

  for i in 1 .. coalesce(array_length(p_addon_style_ids, 1), 0) loop
    select * into v_addon
    from public.styles s
    where s.id = p_addon_style_ids[i] and s.is_active and s.category = 'helmet_cover';
    if not found then
      raise exception 'addon_not_found' using errcode = 'P0001';
    end if;
    if p_addon_cents[i] <> v_addon.addon_price_cents then
      raise exception 'price_changed' using errcode = 'P0001';
    end if;

    select * into v_child from public.insert_booking_row(
      v_booking_no || '-' || i, v_main.booking_id, v_addon.id, null, p_start, p_end, v_settings.buffer_days,
      p_customer_name, p_customer_email, p_customer_phone,
      p_fulfillment_method, p_shipping_address, p_customer_note,
      v_addon.addon_price_cents, v_addon.addon_price_cents, 0
    );
    -- 抛出异常会让整个预订（含雪服那一行）一起回滚
    if not found then
      raise exception 'addon_unavailable' using errcode = 'P0001';
    end if;
  end loop;

  booking_id := v_main.booking_id;
  booking_no := v_booking_no;
  inventory_item_id := v_main.inventory_item_id;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 函数权限：新建的函数默认对 public 开放，这里统一收回再按需授予
-- ---------------------------------------------------------------------------
revoke execute on function
  public.style_rental_price_cents(uuid, integer),
  public.is_item_free(uuid, daterange),
  public.sync_addon_status(),
  public.insert_booking_row(text, uuid, uuid, text, date, date, integer, text, text, text, text, text, text, integer, integer, integer),
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer, uuid[], integer[])
from public, anon, authenticated;

grant execute on function public.style_rental_price_cents(uuid, integer) to anon, authenticated, service_role;
grant execute on function
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer, uuid[], integer[])
to service_role;
