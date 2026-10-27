-- Sunny Closet: tiered pricing + minimum shipping rental
--
-- Rental is no longer "days × daily price" but looked up in a price table by rental length:
--   rental_prices_cents[n] = total rental for n days (cents); days beyond the array length use the last tier.
--   Defaults: 1 day $49, 2 days $79, 3 days $99, 4 days $119, 5+ days $149.
-- Maximum rental becomes 7 days (the price table only covers up to 5–7 days).
-- Local pickup minimum is 1 day; shipping minimum is shipping_min_days (default 2).
-- Prices and minimum days are re-validated in create_booking, so stale prices on a page can't be submitted.

alter table public.settings
  add column rental_prices_cents integer[] not null
    default array[4900, 7900, 9900, 11900, 14900],
  add column shipping_min_days integer not null default 2
    check (shipping_min_days between 1 and 30),
  add constraint settings_rental_prices_valid check (
    array_length(rental_prices_cents, 1) between 1 and 31
    and array_position(rental_prices_cents, null) is null
    and 0 <= all (rental_prices_cents)
  );

update public.settings set max_rental_days = 7 where id;

-- daily_price_cents on styles is now only the "from" price on listings, set to tier 1 of the table
update public.styles
set daily_price_cents = (select rental_prices_cents[1] from public.settings where id);

-- Rental due for p_days days (cents)
create or replace function public.rental_price_cents(p_days integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select s.rental_prices_cents[least(p_days, array_length(s.rental_prices_cents, 1))]
  from public.settings s
  where s.id and p_days >= 1;
$$;

grant execute on function public.rental_price_cents(integer) to anon, authenticated, service_role;

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

  if p_fulfillment_method = 'shipping'
     and p_end - p_start + 1 < v_settings.shipping_min_days then
    raise exception 'shipping_min_days' using errcode = 'P0001';
  end if;

  select * into v_style from public.styles s where s.id = p_style_id and s.is_active;
  if not found then
    raise exception 'style_not_found' using errcode = 'P0001';
  end if;

  -- Rental is validated against the price table; the deposit still comes from the style
  if p_rental_cents <> public.rental_price_cents(p_end - p_start + 1)
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
        null;
    end;
  end loop;

  raise exception 'no_availability' using errcode = 'P0001';
end;
$$;
