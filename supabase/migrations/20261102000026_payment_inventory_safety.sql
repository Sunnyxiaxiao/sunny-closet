-- Sunny Closet: payment and inventory safety
--
-- 1) One payment attempt per order at a time. Before opening a Stripe Checkout page, the server claims an attempt on the order
--    (claim_checkout_attempt, under a row lock): a new attempt key and expiry, or the attempt already in progress.
--    The key is the Stripe idempotency key and is written into the session's metadata, so two requests at once get the same
--    Stripe page, a session that was created but not saved can still be found, and only the current attempt's expiry cancels the order.
-- 2) Refunds owed: a payment that lands on a cancelled order (or a second payment) is recorded as a refund due until the admin
--    has refunded it in Stripe.
-- 3) Charges against a saved card are recorded before Stripe is called (status 'pending', with the idempotency key), so a charge
--    whose result is unknown (network error) can be retried with the same key, from any device, without charging twice.
--    An order can have only one charge still pending / unknown.
-- 4) Inventory locking: placing an order and adding a manual block both lock the inventory rows involved before checking and writing,
--    so an order and a block on the same piece can't both go through. An order locks all the pieces it could take at once,
--    in id order, so two orders can't lock in opposite orders.
-- 5) Condition notes are copied onto the order in the same transaction that assigns the piece; an order line that gets a piece with
--    a condition note must say the customer confirmed the notes (condition_ack), else the whole order fails.

-- ---------------------------------------------------------------------------
-- 1, 2) Payment attempts and refunds owed
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column checkout_attempt_key uuid,
  add column checkout_attempt_expires_at timestamptz,
  add column refund_status text check (refund_status in ('due', 'refunded')),
  add column refund_cents integer check (refund_cents >= 0),
  add column refunded_at timestamptz;

comment on column public.bookings.stripe_checkout_session_id is
  'The current attempt''s Checkout session, once saved (see checkout_attempt_key)';

-- Claims the order's payment attempt. Returns the attempt in progress, or starts a new one when there is none
-- or when the caller says the attempt p_replace_key is over (its Stripe page expired, checked with Stripe first).
-- Raises order_not_payable for orders that aren't waiting on an online payment.
create function public.claim_checkout_attempt(p_booking_id uuid, p_replace_key uuid default null)
returns table (attempt_key uuid, expires_at timestamptz, session_id text, customer_id text, created boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_created boolean := false;
begin
  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found
     or v.parent_booking_id is not null
     or v.status <> 'pending'
     or v.paid_at is not null
     or v.payment_method is not distinct from 'in_person' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;

  if v.checkout_attempt_key is null or v.checkout_attempt_key = p_replace_key then
    -- A couple of minutes over the 30-minute payment window: Stripe needs a page to stay open at least 30 minutes
    update public.bookings b
    set checkout_attempt_key = gen_random_uuid(),
        checkout_attempt_expires_at = now() + interval '32 minutes',
        stripe_checkout_session_id = null
    where b.id = p_booking_id
    returning * into v;
    v_created := true;
  end if;

  attempt_key := v.checkout_attempt_key;
  expires_at := v.checkout_attempt_expires_at;
  session_id := v.stripe_checkout_session_id;
  customer_id := v.stripe_customer_id;
  created := v_created;
  return next;
end;
$$;

revoke execute on function public.claim_checkout_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_checkout_attempt(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Charges against a saved card: recorded before calling Stripe
-- ---------------------------------------------------------------------------
alter table public.card_charges drop constraint deposit_charges_status_check;
alter table public.card_charges
  add constraint card_charges_status_check
    check (status in ('pending', 'unknown', 'processing', 'succeeded', 'failed')),
  -- Stripe idempotency key of this attempt (charges made before this migration have none)
  add column idempotency_key uuid unique,
  add column updated_at timestamptz not null default now();

-- At most one charge per order whose result isn't known yet
create unique index card_charges_one_open_idx on public.card_charges (booking_id) where status in ('pending', 'unknown');

-- ---------------------------------------------------------------------------
-- 4) Manual blocks go through a function that locks the piece first
-- ---------------------------------------------------------------------------
drop policy inventory_blocks_admin_insert on public.inventory_blocks;
revoke insert on public.inventory_blocks from authenticated;

-- Blocks dates on a piece (admin only). Refuses when an order holds the piece in that time (booking_conflict <order no.>).
create function public.add_inventory_block(p_item_id uuid, p_start date, p_end date, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conflict text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  select b.booking_no into v_conflict
  from public.bookings b
  where b.inventory_item_id = p_item_id
    and public.is_blocking_status(b.status)
    and b.blocked_range && daterange(p_start, p_end + 1, '[)')
  order by b.start_date
  limit 1;
  if v_conflict is not null then
    raise exception 'booking_conflict %', v_conflict using errcode = 'P0001';
  end if;

  insert into public.inventory_blocks (inventory_item_id, start_date, end_date, reason)
  values (p_item_id, p_start, p_end, coalesce(p_reason, ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_inventory_block(uuid, date, date, text) from public, anon;
grant execute on function public.add_inventory_block(uuid, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Condition notes copied when the piece is assigned (same signature, adds the two condition columns)
-- ---------------------------------------------------------------------------
create or replace function public.insert_booking_row(
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
        rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents,
        condition_snapshot, condition_acknowledged_at
      )
      select
        p_booking_no, p_parent_booking_id, p_style_id, v_item_id, i.size,
        p_start, p_end, p_buffer_days, p_lead_days, p_tail_days, 'pending',
        p_fulfillment_method, nullif(trim(coalesce(p_shipping_address, '')), ''),
        trim(p_customer_name), lower(trim(p_customer_email)), trim(p_customer_phone),
        coalesce(p_customer_note, ''),
        p_end - p_start + 1, p_daily_price_cents, p_rental_cents, p_deposit_cents,
        p_rental_cents + p_deposit_cents,
        -- The piece's condition note as it is now (create_order checks the customer confirmed it)
        case when i.condition_note <> '' then jsonb_build_object(
          'code', i.code,
          'size', i.size,
          'note', i.condition_note,
          'noteEn', i.condition_note_en,
          'imageUrls', to_jsonb(i.condition_image_urls)
        ) end,
        case when i.condition_note <> '' then now() end
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
-- 4, 5) create_order: locks the pieces first; checks condition notes were confirmed (same signature)
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
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
  v_style_ids uuid[];
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

  -- Every style this order could take a piece of: the items, their sets' pieces and their add-ons
  -- (malformed ids are skipped here; the item they're on fails below, with its line number)
  select array_agg(distinct x.s::uuid) into v_style_ids
  from (
    select l ->> 'style_id' as s from jsonb_array_elements(p_lines) l
    union all
    select a from jsonb_array_elements(p_lines) l
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(l -> 'addon_style_ids') = 'array' then l -> 'addon_style_ids' else '[]'::jsonb end
    ) a
  ) x
  where x.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  select coalesce(array_agg(distinct p), '{}') || coalesce(v_style_ids, '{}') into v_style_ids
  from public.styles st
  cross join lateral unnest(st.bundle_style_ids) p
  where st.id = any (v_style_ids);
  -- Lock their pieces, all at once and in id order, before checking availability: a manual block (add_inventory_block)
  -- or another order on the same piece waits until this order is done, then sees it
  perform 1 from public.inventory_items i where i.style_id = any (v_style_ids) order by i.id for update;

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

    -- A piece with a condition note was assigned: the customer must have confirmed this item's notes
    if (v_line ->> 'condition_ack') is distinct from 'true' and exists (
      select 1 from public.bookings b
      where (b.id = v_result.booking_id or b.parent_booking_id = v_result.booking_id)
        and b.condition_snapshot is not null
    ) then
      raise exception 'condition_not_acknowledged line=%', v_index using errcode = 'P0001';
    end if;

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
