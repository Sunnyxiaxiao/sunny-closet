-- Sunny Closet：核心表结构、防超订约束、预订与可用性函数
-- 日期全部使用 date 类型（只有日期、没有时刻），避免时区问题。
-- 租期规则：取件日与归还日都算在内；占用区间 = [取件日, 归还日 + 1 + 缓冲天数)

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 通用：自动维护 updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 店铺配置（只有一行）
-- ---------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),
  buffer_days integer not null default 1 check (buffer_days between 0 and 30),
  max_rental_days integer not null default 30 check (max_rental_days between 1 and 365),
  updated_at timestamptz not null default now()
);

create trigger settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 款式
-- ---------------------------------------------------------------------------
create table public.styles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  daily_price_cents integer not null check (daily_price_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  image_urls text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger styles_updated_at
  before update on public.styles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 具体库存件
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.styles (id) on delete restrict,
  size text not null check (length(trim(size)) > 0),
  code text not null unique check (length(trim(code)) > 0),
  status text not null default 'available' check (status in ('available', 'inactive')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_items_style_size_idx on public.inventory_items (style_id, size);

create trigger inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 预订
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_no text not null unique,
  style_id uuid not null references public.styles (id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  size text not null,
  start_date date not null,
  end_date date not null,
  buffer_days integer not null check (buffer_days >= 0),
  blocked_range daterange generated always as (
    daterange(start_date, end_date + 1 + buffer_days, '[)')
  ) stored,
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'rejected', 'picked_up', 'returned', 'cancelled')
  ),
  fulfillment_method text not null check (fulfillment_method in ('pickup', 'shipping')),
  shipping_address text,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_email text not null check (length(trim(customer_email)) > 0),
  customer_phone text not null check (length(trim(customer_phone)) > 0),
  customer_note text not null default '',
  rental_days integer not null check (rental_days >= 1),
  daily_price_cents integer not null check (daily_price_cents >= 0),
  rental_cents integer not null check (rental_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_dates_valid check (end_date >= start_date),
  constraint bookings_rental_days_match check (rental_days = end_date - start_date + 1),
  constraint bookings_total_match check (total_cents = rental_cents + deposit_cents),
  constraint bookings_shipping_address_required check (
    fulfillment_method = 'pickup'
    or (shipping_address is not null and length(trim(shipping_address)) > 0)
  ),
  -- 防超订的核心：同一件库存、仍占用库存的订单，其占用区间（含缓冲天数）不得重叠。
  constraint bookings_no_overlap exclude using gist (
    inventory_item_id with =,
    blocked_range with &&
  ) where (status in ('pending', 'confirmed', 'picked_up', 'returned'))
);

create index bookings_status_idx on public.bookings (status, start_date);
create index bookings_created_at_idx on public.bookings (created_at desc);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- 仍占用库存的订单状态（与上面排他约束的 where 条件保持一致）
create or replace function public.is_blocking_status(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('pending', 'confirmed', 'picked_up', 'returned');
$$;

-- ---------------------------------------------------------------------------
-- 防刷：记录提交次数（只由服务端写入）
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create index rate_limits_lookup_idx on public.rate_limits (bucket, key_hash, created_at desc);

-- 原子地“记一次并判断是否超限”。返回 true 表示允许。
create or replace function public.hit_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_key_hash, 0));

  delete from public.rate_limits
  where created_at < now() - interval '1 day';

  select count(*) into v_count
  from public.rate_limits
  where bucket = p_bucket
    and key_hash = p_key_hash
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limits (bucket, key_hash) values (p_bucket, p_key_hash);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 预订编号：SC- 加 8 位易读字符（去掉 0/O/1/I 等易混字符）
-- ---------------------------------------------------------------------------
create or replace function public.generate_booking_no()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- uuid v4 的第 0–3、10–15 字节是完全随机的
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_positions constant integer[] := array[0, 1, 2, 3, 10, 11, 12, 13];
  v_result text := 'SC-';
  v_pos integer;
begin
  foreach v_pos in array v_positions loop
    v_result := v_result || substr(v_alphabet, (get_byte(v_bytes, v_pos) % 32) + 1, 1);
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 可用性查询：返回每个款式、每个尺码在指定日期段内可租的件数。
-- 不传日期时返回各尺码的可租件总数（不考虑排期）。
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
    count(*) filter (
      where v_range is null
        or not exists (
          select 1
          from public.bookings b
          where b.inventory_item_id = i.id
            and public.is_blocking_status(b.status)
            and b.blocked_range && v_range
        )
    )::integer as available_count
  from public.inventory_items i
  join public.styles st on st.id = i.style_id
  where i.status = 'available'
    and st.is_active
    and (p_style_id is null or i.style_id = p_style_id)
  group by i.style_id, i.size;
end;
$$;

-- ---------------------------------------------------------------------------
-- 创建预订：自动分配一件可用库存。
-- 只允许服务端（service_role）调用；价格由服务端的价格函数算好后传入，这里做一致性校验。
-- 并发安全：真正的保证来自 bookings_no_overlap 排他约束；
-- 如果两个请求同时抢到同一件，后提交的会触发 exclusion_violation，这里捕获后换下一件。
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
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
  p_deposit_cents integer
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
  v_range daterange;
  v_item_id uuid;
  v_booking_id uuid;
  v_booking_no text;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  select * into v_settings from public.settings s where s.id;

  if p_end - p_start + 1 > v_settings.max_rental_days then
    raise exception 'rental_too_long' using errcode = 'P0001';
  end if;

  select * into v_style from public.styles s where s.id = p_style_id and s.is_active;
  if not found then
    raise exception 'style_not_found' using errcode = 'P0001';
  end if;

  if p_daily_price_cents <> v_style.daily_price_cents
     or p_deposit_cents <> v_style.deposit_cents then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;

  v_range := daterange(p_start, p_end + 1 + v_settings.buffer_days, '[)');

  for v_item_id in
    select i.id
    from public.inventory_items i
    where i.style_id = p_style_id
      and i.size = p_size
      and i.status = 'available'
      and not exists (
        select 1
        from public.bookings b
        where b.inventory_item_id = i.id
          and public.is_blocking_status(b.status)
          and b.blocked_range && v_range
      )
    order by i.code
  loop
    begin
      insert into public.bookings (
        booking_no, style_id, inventory_item_id, size,
        start_date, end_date, buffer_days, status,
        fulfillment_method, shipping_address,
        customer_name, customer_email, customer_phone, customer_note,
        rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
      ) values (
        public.generate_booking_no(), p_style_id, v_item_id, p_size,
        p_start, p_end, v_settings.buffer_days, 'pending',
        p_fulfillment_method, nullif(trim(coalesce(p_shipping_address, '')), ''),
        trim(p_customer_name), lower(trim(p_customer_email)), trim(p_customer_phone),
        coalesce(p_customer_note, ''),
        p_end - p_start + 1, p_daily_price_cents, p_rental_cents, p_deposit_cents,
        p_rental_cents + p_deposit_cents
      )
      returning id, bookings.booking_no into v_booking_id, v_booking_no;

      booking_id := v_booking_id;
      booking_no := v_booking_no;
      inventory_item_id := v_item_id;
      return next;
      return;
    exception
      when exclusion_violation then
        -- 这件刚被并发请求占用，继续尝试下一件
        null;
    end;
  end loop;

  raise exception 'no_availability' using errcode = 'P0001';
end;
$$;
