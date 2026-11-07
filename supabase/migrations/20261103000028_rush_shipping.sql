-- Shipping orders placed on short notice (audit #15)
--
-- Shipping normally needs about a week's notice. A shipping order whose first ski day is sooner (but still at least the
-- shipping lead days away) needs one of two things, chosen by the customer at checkout:
--   - rush shipping (Priority Mail): rush_fee_cents is added to the order's shipping fee (also when shipping is free),
--     and the order goes through like any other;
--   - no rush: the owner has to accept it first. The customer pays as usual, but a paid order stays pending with
--     acceptance_status 'awaiting' (paying doesn't confirm it) until the owner accepts ('accepted', confirmed) or declines
--     ('declined', cancelled, the payment marked as a refund due). Unanswered for 24 hours, it's declined automatically
--     (the owner gets a reminder first: acceptance_reminded_at).
-- acceptance_status is null for every other order. Only the main order carries these columns.

alter table public.bookings
  add column rush_fee_cents integer not null default 0 check (rush_fee_cents >= 0),
  add column acceptance_status text check (acceptance_status in ('awaiting', 'accepted', 'declined')),
  add column acceptance_reminded_at timestamptz,
  add column acceptance_decided_at timestamptz,
  add constraint bookings_rush_fee_in_shipping check (rush_fee_cents <= shipping_cents),
  add constraint bookings_rush_or_acceptance check (rush_fee_cents = 0 or acceptance_status is null);

create index bookings_awaiting_idx on public.bookings (paid_at) where acceptance_status = 'awaiting';

-- create_order plus the short-notice choice, in one transaction: p_shipping_cents already includes p_rush_fee_cents.
-- Service role only (the server checks the dates and computes the fees).
create function public.place_order(
  p_lines jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_shipping_address text,
  p_customer_note text,
  p_shipping_cents integer,
  p_rush_fee_cents integer,
  p_needs_acceptance boolean
)
returns table (booking_id uuid, booking_no text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order record;
begin
  if p_rush_fee_cents is null or p_rush_fee_cents < 0 or p_needs_acceptance is null
     or ((p_rush_fee_cents > 0 or p_needs_acceptance) and p_fulfillment_method is distinct from 'shipping')
     or (p_rush_fee_cents > 0 and p_needs_acceptance)
     or p_rush_fee_cents > coalesce(p_shipping_cents, 0) then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;

  select * into v_order
  from public.create_order(
    p_lines, p_customer_name, p_customer_email, p_customer_phone,
    p_fulfillment_method, p_shipping_address, p_customer_note, p_shipping_cents
  );

  update public.bookings
  set rush_fee_cents = p_rush_fee_cents,
      acceptance_status = case when p_needs_acceptance then 'awaiting' end
  where id = v_order.booking_id;

  return query select v_order.booking_id, v_order.booking_no;
end;
$$;

revoke execute on function public.place_order(jsonb, text, text, text, text, text, text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text, integer, integer, boolean)
  to service_role;
