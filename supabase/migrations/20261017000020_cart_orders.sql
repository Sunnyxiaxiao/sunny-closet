-- Sunny Closet: cart (several items in one order)
--
-- Customers put several outfits / accessories in a cart and submit them as one order with one order number. Free shipping across the contiguous US.
--
-- Orders keep the "main order + child orders" structure:
--   item 1 is the main order (order number SC-XXXXXXXX);
--   every other item is a child order (SC-XXXXXXXX-1, -2, …, cart_item = true) with its own rental and deposit;
--   each item's helmet-cover add-ons and other bundle separates also hang off the main order.
--   When the main order's status changes, child orders follow (trigger bookings_sync_addon_status).
--
-- create_order calls create_booking for each item (prices, inventory and minimum days are validated there);
-- if any item fails the whole order rolls back, and the error says which item (e.g. no_availability line=2).
-- Shipped orders go out together, so every item must have the same ski days.

alter table public.bookings
  add column cart_item boolean not null default false;

create function public.create_order(
  p_lines jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_shipping_address text,
  p_customer_note text
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

  booking_id := v_main_id;
  booking_no := v_main_no;
  return next;
end;
$$;

revoke execute on function
  public.create_order(jsonb, text, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.create_order(jsonb, text, text, text, text, text, text)
to service_role;
