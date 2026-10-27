-- Sunny Closet: bill ski days only
--
-- start_date / end_date on bookings become the first / last ski day, and rental is charged for those days only (price tables unchanged).
-- But the item is with the customer longer, and inventory must be reserved for that time too:
--   Local pickup: pick up the evening before skiing, return by noon the day after the last ski day → 1 day before, 1 day after
--   Shipping: ships 3 days before skiing; the customer ships it back by the next day, return transit about 3 days → 3 days before, 4 days after
-- The existing cleaning buffer (buffer_days) follows.
-- These day counts live in settings and can be adjusted to real logistics; each order records the values at order time in lead_days / tail_days,
-- so changing settings later doesn't affect existing orders. Existing orders get lead_days / tail_days = 0, so their occupied ranges are unchanged.

alter table public.settings
  add column pickup_lead_days integer not null default 1 check (pickup_lead_days between 0 and 14),
  add column pickup_tail_days integer not null default 1 check (pickup_tail_days between 0 and 14),
  add column shipping_lead_days integer not null default 3 check (shipping_lead_days between 0 and 14),
  add column shipping_tail_days integer not null default 4 check (shipping_tail_days between 0 and 14);

-- Days occupied before and after the ski days for a fulfillment method
create or replace function public.fulfillment_padding(p_fulfillment_method text)
returns table (lead_days integer, tail_days integer)
language sql
stable
set search_path = ''
as $$
  select
    case when p_fulfillment_method = 'shipping' then s.shipping_lead_days else s.pickup_lead_days end,
    case when p_fulfillment_method = 'shipping' then s.shipping_tail_days else s.pickup_tail_days end
  from public.settings s
  where s.id;
$$;

-- ---------------------------------------------------------------------------
-- Occupied range = [first ski day − lead days, last ski day + 1 + tail days + cleaning days)
-- A generated column's expression can't be altered, so drop the exclusion constraint and the old column, then recreate them with the new formula
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings drop column blocked_range;

alter table public.bookings
  add column lead_days integer not null default 0 check (lead_days >= 0),
  add column tail_days integer not null default 0 check (tail_days >= 0),
  add column blocked_range daterange generated always as (
    daterange(start_date - lead_days, end_date + 1 + tail_days + buffer_days, '[)')
  ) stored,
  add constraint bookings_no_overlap exclude using gist (
    inventory_item_id with =,
    blocked_range with &&
  ) where (status in ('pending', 'confirmed', 'picked_up', 'returned'));

-- Occupied range of an item for ski days p_start–p_end with fulfillment method p_fulfillment_method
create or replace function public.rental_blocked_range(p_start date, p_end date, p_fulfillment_method text)
returns daterange
language sql
stable
set search_path = ''
as $$
  select daterange(p_start - p.lead_days, p_end + 1 + p.tail_days + s.buffer_days, '[)')
  from public.settings s
  cross join public.fulfillment_padding(p_fulfillment_method) p
  where s.id;
$$;

-- ---------------------------------------------------------------------------
-- Availability: adds a fulfillment method parameter (defaults to local pickup, the shortest occupancy)
-- ---------------------------------------------------------------------------
drop function public.get_availability(date, date, uuid);

create function public.get_availability(
  p_start date default null,
  p_end date default null,
  p_style_id uuid default null,
  p_fulfillment_method text default 'pickup'
)
returns table (style_id uuid, size text, total_count integer, available_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_range daterange;
begin
  if (p_start is null) <> (p_end is null) then
    raise exception 'start and end must both be provided' using errcode = '22023';
  end if;

  if p_start is not null then
    if p_end < p_start then
      raise exception 'end date before start date' using errcode = '22023';
    end if;
    v_range := public.rental_blocked_range(p_start, p_end, p_fulfillment_method);
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
-- Write the booking row: record lead / tail days
-- ---------------------------------------------------------------------------
drop function public.insert_booking_row(
  text, uuid, uuid, text, date, date, integer, text, text, text, text, text, text, integer, integer, integer
);

create function public.insert_booking_row(
  p_booking_no text,
  p_parent_booking_id uuid,
  p_style_id uuid,
  p_size text,
  p_start date,
  p_end date,
  p_buffer_days integer,
  p_lead_days integer,
  p_tail_days integer,
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
  v_range daterange := daterange(p_start - p_lead_days, p_end + 1 + p_tail_days + p_buffer_days, '[)');
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
        start_date, end_date, buffer_days, lead_days, tail_days, status,
        fulfillment_method, shipping_address,
        customer_name, customer_email, customer_phone, customer_note,
        rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
      )
      select
        p_booking_no, p_parent_booking_id, p_style_id, v_item_id, i.size,
        p_start, p_end, p_buffer_days, p_lead_days, p_tail_days, 'pending',
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
-- Create a booking: same parameters, records lead / tail days for the fulfillment method
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
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  v_days := p_end - p_start + 1;

  select * into v_settings from public.settings s where s.id;
  select * into v_padding from public.fulfillment_padding(p_fulfillment_method);

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
    -- Raising an exception rolls back the whole booking (including the outfit row)
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
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.fulfillment_padding(text),
  public.rental_blocked_range(date, date, text),
  public.get_availability(date, date, uuid, text),
  public.insert_booking_row(text, uuid, uuid, text, date, date, integer, integer, integer, text, text, text, text, text, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.get_availability(date, date, uuid, text) to anon, authenticated;
