-- Sunny Closet: bundles (sets curated by the owner whose pieces can also be rented separately)
--
-- styles.bundle_style_ids: the separates a bundle consists of (the jacket and pants are each a style with their own inventory).
--   Bundles hold no inventory of their own:
--   - Available count = the minimum available count of each separate in the same size (get_availability)
--   - Ordering reserves each separate's real inventory at once (create_booking), so bundles and separates never double-book
-- bookings.bundle_part: child orders for the bundle's separates after the first ($0, following the main order),
--   distinct from helmet-cover add-on child orders.

alter table public.styles
  add column bundle_style_ids uuid[]
    check (bundle_style_ids is null or (
      cardinality(bundle_style_ids) between 2 and 5
      and array_position(bundle_style_ids, null) is null
    ));

alter table public.bookings
  add column bundle_part boolean not null default false;

create or replace function public.get_availability(
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
  v_parts uuid[];
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

  if p_style_id is not null then
    select st.bundle_style_ids into v_parts from public.styles st where st.id = p_style_id;
  end if;

  return query
  with counts as (
    select
      i.style_id,
      i.size,
      count(*)::integer as total_count,
      count(*) filter (where v_range is null or public.is_item_free(i.id, v_range))::integer as available_count
    from public.inventory_items i
    join public.styles st on st.id = i.style_id
    where i.status = 'available'
      and st.is_active
      and (p_style_id is null or i.style_id = p_style_id or i.style_id = any (coalesce(v_parts, '{}')))
    group by i.style_id, i.size
  ),
  bundles as (
    select st.id, st.bundle_style_ids
    from public.styles st
    where st.bundle_style_ids is not null
      and st.is_active
      and (p_style_id is null or st.id = p_style_id)
  )
  select c.style_id, c.size, c.total_count, c.available_count
  from counts c
  where p_style_id is null or c.style_id = p_style_id
  union all
  -- Bundles: every separate must have this size, and the count is the minimum
  select b.id, c.size, min(c.total_count)::integer, min(c.available_count)::integer
  from bundles b
  cross join lateral unnest(b.bundle_style_ids) as part(style_id)
  join counts c on c.style_id = part.style_id
  group by b.id, c.size, cardinality(b.bundle_style_ids)
  having count(*) = cardinality(b.bundle_style_ids);
end;
$$;

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
  v_part_style_id uuid;
  v_seq integer := 0;
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

  -- Regular styles: occupy one of their own items.
  -- Bundles: the main order occupies the first separate (recorded under the bundle, charging the bundle's rental and deposit),
  --           and every other separate gets a $0 child order (bundle_part); if any of them is unavailable, the whole order rolls back.
  select * into v_main from public.insert_booking_row(
    v_booking_no, null, coalesce(v_style.bundle_style_ids[1], p_style_id), p_size, p_start, p_end,
    v_settings.buffer_days, v_padding.lead_days, v_padding.tail_days,
    p_customer_name, p_customer_email, p_customer_phone,
    p_fulfillment_method, p_shipping_address, p_customer_note,
    p_daily_price_cents, p_rental_cents, p_deposit_cents
  );
  if not found then
    raise exception 'no_availability' using errcode = 'P0001';
  end if;

  if v_style.bundle_style_ids is not null then
    update public.bookings b set style_id = p_style_id where b.id = v_main.booking_id;

    foreach v_part_style_id in array v_style.bundle_style_ids[2:] loop
      v_seq := v_seq + 1;
      select * into v_child from public.insert_booking_row(
        v_booking_no || '-' || v_seq, v_main.booking_id, v_part_style_id, p_size, p_start, p_end,
        v_settings.buffer_days, v_padding.lead_days, v_padding.tail_days,
        p_customer_name, p_customer_email, p_customer_phone,
        p_fulfillment_method, p_shipping_address, p_customer_note,
        0, 0, 0
      );
      if not found then
        raise exception 'no_availability' using errcode = 'P0001';
      end if;
      update public.bookings b set bundle_part = true where b.id = v_child.booking_id;
    end loop;
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
      v_booking_no || '-' || (v_seq + i), v_main.booking_id, v_addon.id, null, p_start, p_end,
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
