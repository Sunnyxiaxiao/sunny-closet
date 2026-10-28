-- Sunny Closet: shipping fee
--
-- Shipping is free when the order has a full set (suit / one-piece) rented for 2+ days, or when rental + add-ons reach $99
-- (deposit excluded). Otherwise the order pays one shipping fee by destination state ($15, or $25 for far states).
-- The fee is computed by the server (src/lib/shipping.ts, the only caller of create_order runs as service_role)
-- and stored once on the main order, so summing an order's total_cents still gives the amount due.

alter table public.bookings
  add column shipping_cents integer not null default 0 check (shipping_cents >= 0);

alter table public.bookings drop constraint bookings_total_match;
alter table public.bookings
  add constraint bookings_total_match check (total_cents = rental_cents + deposit_cents + shipping_cents);

drop function public.create_order(jsonb, text, text, text, text, text, text);

create function public.create_order(
  p_lines jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_shipping_address text,
  p_customer_note text,
  p_shipping_cents integer default 0
)
returns table (booking_id uuid, booking_no text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_count integer;
  v_line jsonb;
  v_index integer := 0;
  v_result record;
  v_main_id uuid;
  v_main_no text;
  v_seq integer;
  v_row record;
  v_first_start date;
  v_first_end date;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 1 or v_count > 10 then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;
  -- Pickup never pays shipping
  if p_shipping_cents is null or p_shipping_cents < 0
     or (p_fulfillment_method is distinct from 'shipping' and p_shipping_cents <> 0) then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;

  if p_fulfillment_method = 'shipping' then
    -- Shipped together: every item's ski days must match
    v_first_start := (p_lines -> 0 ->> 'start')::date;
    v_first_end := (p_lines -> 0 ->> 'end')::date;
    if exists (
      select 1 from jsonb_array_elements(p_lines) l
      where (l ->> 'start')::date is distinct from v_first_start
         or (l ->> 'end')::date is distinct from v_first_end
    ) then
      raise exception 'shipping_dates_differ' using errcode = 'P0001';
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_index := v_index + 1;
    begin
      select * into v_result from public.create_booking(
        (v_line ->> 'style_id')::uuid,
        v_line ->> 'size',
        (v_line ->> 'start')::date,
        (v_line ->> 'end')::date,
        p_customer_name, p_customer_email, p_customer_phone,
        p_fulfillment_method, p_shipping_address, p_customer_note,
        (v_line ->> 'daily_price_cents')::integer,
        (v_line ->> 'rental_cents')::integer,
        (v_line ->> 'deposit_cents')::integer,
        coalesce(array(select jsonb_array_elements_text(coalesce(v_line -> 'addon_style_ids', '[]'::jsonb))::uuid), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_line -> 'addon_cents', '[]'::jsonb))::integer), '{}')
      );
    exception
      when raise_exception then
        -- Include which item failed in the error so the page can tell the customer
        raise exception '% line=%', sqlerrm, v_index using errcode = 'P0001';
      when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
           or null_value_not_allowed or not_null_violation then
        raise exception 'invalid_cart line=%', v_index using errcode = 'P0001';
    end;

    if v_index = 1 then
      v_main_id := v_result.booking_id;
      v_main_no := v_result.booking_no;
      select count(*) into v_seq from public.bookings b where b.parent_booking_id = v_main_id;
    else
      -- Items 2+: the item and its add-ons / bundle parts hang off the main order, numbered after it
      for v_row in
        select b.id from public.bookings b
        where b.id = v_result.booking_id or b.parent_booking_id = v_result.booking_id
        order by b.booking_no
      loop
        v_seq := v_seq + 1;
        update public.bookings b
        set parent_booking_id = v_main_id,
            booking_no = v_main_no || '-' || v_seq,
            cart_item = (b.id = v_result.booking_id)
        where b.id = v_row.id;
      end loop;
    end if;
  end loop;

  -- The shipping fee is charged once, on the main order
  if p_shipping_cents > 0 then
    update public.bookings b
    set shipping_cents = p_shipping_cents,
        total_cents = b.total_cents + p_shipping_cents
    where b.id = v_main_id;
  end if;

  booking_id := v_main_id;
  booking_no := v_main_no;
  return next;
end;
$$;

revoke execute on function
  public.create_order(jsonb, text, text, text, text, text, text, integer)
from public, anon, authenticated;

grant execute on function
  public.create_order(jsonb, text, text, text, text, text, text, integer)
to service_role;
