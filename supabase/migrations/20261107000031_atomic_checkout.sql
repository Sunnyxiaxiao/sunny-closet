-- Keep the previous RPC for compatibility with the currently deployed application.
-- New checkout records payment intent and checks the acknowledged condition in one transaction.
create function public.place_order_checked(
  p_lines jsonb, p_customer_name text, p_customer_email text, p_customer_phone text,
  p_fulfillment_method text, p_shipping_address text, p_customer_note text,
  p_shipping_cents integer, p_rush_fee_cents integer, p_needs_acceptance boolean,
  p_payment_method text, p_cash_deposit_cents integer, p_locale text
)
returns table (booking_id uuid, booking_no text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_order record;
begin
  if (p_payment_method is not null and p_payment_method not in ('card', 'in_person_card', 'in_person'))
     or p_locale is null or p_locale not in ('en', 'zh')
     or p_cash_deposit_cents is null or p_cash_deposit_cents < 0
     or (p_cash_deposit_cents <> 0 and p_payment_method is distinct from 'in_person')
     or (p_payment_method in ('in_person', 'in_person_card') and p_fulfillment_method <> 'pickup') then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;

  select * into v_order from public.place_order(
    p_lines, p_customer_name, p_customer_email, p_customer_phone,
    p_fulfillment_method, p_shipping_address, p_customer_note,
    p_shipping_cents, p_rush_fee_cents, p_needs_acceptance
  );

  -- create_order has locked the assigned inventory rows and captured their notes.
  -- Compare the actual assigned snapshots with the content verified by the server,
  -- not just a boolean saying some earlier notes were acknowledged.
  if exists (
    select 1 from public.bookings b
    where (b.id = v_order.booking_id or b.parent_booking_id = v_order.booking_id)
      and b.condition_snapshot is not null
      and not exists (
        select 1 from jsonb_array_elements(p_lines) l
        cross join lateral jsonb_array_elements(coalesce(l -> 'condition_notes', '[]'::jsonb)) n
        where n ->> 'itemId' = b.inventory_item_id::text
          and n ->> 'text' = case when p_locale = 'en'
            then coalesce(nullif(b.condition_snapshot ->> 'noteEn', ''), b.condition_snapshot ->> 'note')
            else b.condition_snapshot ->> 'note' end
          and n -> 'imageUrls' = b.condition_snapshot -> 'imageUrls'
      )
  ) then
    raise exception 'condition_not_acknowledged' using errcode = 'P0001';
  end if;

  update public.bookings set
    payment_method = p_payment_method,
    cash_deposit_cents = p_cash_deposit_cents,
    status = case when p_payment_method = 'in_person' then 'confirmed' else status end
  where id = v_order.booking_id;
  return query select v_order.booking_id, v_order.booking_no;
end;
$$;
revoke execute on function public.place_order_checked(jsonb,text,text,text,text,text,text,integer,integer,boolean,text,integer,text)
  from public, anon, authenticated;
grant execute on function public.place_order_checked(jsonb,text,text,text,text,text,text,integer,integer,boolean,text,integer,text)
  to service_role;
