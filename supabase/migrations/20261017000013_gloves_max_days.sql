-- Sunny Closet：单租手套最长 10 天
--
-- 手套按自己的价目表封顶（普通手套 3 天起 $25），如果不限天数就可能被单租一整个雪季。
-- 规则：和雪服一起租的跟雪服一起归还（雪服最长 max_rental_days 天）；单租手套最长 gloves_max_rental_days 天。
-- 只改了 create_booking 里“租期太长”的判断，其它逻辑与 20261017000008 相同。

alter table public.settings
  add column gloves_max_rental_days integer not null default 10
    check (gloves_max_rental_days between 1 and 365);

grant update (gloves_max_rental_days) on public.settings to authenticated;

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
  v_padding record;
  v_main record;
  v_child record;
  v_days integer;
  v_max_days integer;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  v_days := p_end - p_start + 1;

  select * into v_settings from public.settings s where s.id;
  select * into v_padding from public.fulfillment_padding(p_fulfillment_method);

  select * into v_style from public.styles s where s.id = p_style_id and s.is_active;
  if not found then
    raise exception 'style_not_found' using errcode = 'P0001';
  end if;

  v_max_days := case when v_style.category = 'gloves'
                     then v_settings.gloves_max_rental_days
                     else v_settings.max_rental_days end;
  if v_days > v_max_days then
    raise exception 'rental_too_long' using errcode = 'P0001';
  end if;

  if p_fulfillment_method = 'shipping' and v_days < v_settings.shipping_min_days then
    raise exception 'shipping_min_days' using errcode = 'P0001';
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
    v_booking_no, null, p_style_id, p_size, p_start, p_end,
    v_settings.buffer_days, v_padding.lead_days, v_padding.tail_days,
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
      v_booking_no || '-' || i, v_main.booking_id, v_addon.id, null, p_start, p_end,
      v_settings.buffer_days, v_padding.lead_days, v_padding.tail_days,
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
