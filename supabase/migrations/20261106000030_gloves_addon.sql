-- Sunny Closet: gloves as outfit add-ons, and at most one helmet cover + one pair of gloves at the add-on price per outfit
--
-- 1) Gloves can be added to an outfit like a helmet cover: a flat add-on price for the whole rental (styles.addon_price_cents,
--    $10, Crystal $15), in a chosen color / size. Gloves without an add-on price aren't offered as add-ons.
-- 2) An outfit item (set, one-piece, top or pants) takes at most one helmet cover and one pair of gloves as add-ons. Across the
--    order, there are at most as many of each as there are outfits: sets and one-pieces, plus tops paired with pants
--    (a top or pants on its own isn't an outfit). More are rented as standalone items at their usual price.
-- 3) cart_availability checks gloves add-ons too, in their size.

-- ---------------------------------------------------------------------------
-- 1) Add-on prices for the gloves there are
-- ---------------------------------------------------------------------------
update public.styles
set addon_price_cents = case when 'crystal' = any (tags) then 1500 else 1000 end
where category = 'gloves' and addon_price_cents is null;

-- ---------------------------------------------------------------------------
-- 2) create_booking: add-on sizes (gloves), one add-on per kind, outfits only
-- p_addon_sizes: the chosen size of each add-on, matched by position (null for a helmet cover: any piece)
-- ---------------------------------------------------------------------------
drop function public.create_booking(
  uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer, uuid[], integer[]
);

create function public.create_booking(
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
  p_addon_cents integer[] default '{}',
  p_addon_sizes text[] default '{}'
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
  v_addon_count integer := coalesce(array_length(p_addon_style_ids, 1), 0);
  v_addon_size text;
  v_addon_kinds text[] := '{}';
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

  -- Add-ons only on outfits; sizes either left out or one per add-on
  if v_addon_count <> coalesce(array_length(p_addon_cents, 1), 0)
     or coalesce(array_length(p_addon_sizes, 1), 0) not in (0, v_addon_count)
     or (v_addon_count > 0 and v_style.category not in ('suit', 'one_piece', 'jacket', 'pants')) then
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

  for i in 1 .. v_addon_count loop
    select * into v_addon
    from public.styles s
    where s.id = p_addon_style_ids[i] and s.is_active and s.category in ('helmet_cover', 'gloves')
      and s.addon_price_cents is not null;
    if not found then
      raise exception 'addon_not_found' using errcode = 'P0001';
    end if;
    -- One helmet cover and one pair of gloves at most
    if v_addon.category = any (v_addon_kinds) then
      raise exception 'invalid_addons' using errcode = 'P0001';
    end if;
    v_addon_kinds := v_addon_kinds || v_addon.category;
    if p_addon_cents[i] <> v_addon.addon_price_cents then
      raise exception 'price_changed' using errcode = 'P0001';
    end if;
    -- Gloves come in the chosen color / size; a helmet cover is any piece of the style
    v_addon_size := case when v_addon.category = 'gloves' then nullif(trim(coalesce(p_addon_sizes[i], '')), '') end;
    if v_addon.category = 'gloves' and v_addon_size is null then
      raise exception 'invalid_addons' using errcode = 'P0001';
    end if;

    select * into v_child from public.insert_booking_row(
      v_booking_no || '-' || (v_seq + i), v_main.booking_id, v_addon.id, v_addon_size, p_start, p_end,
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

revoke execute on function
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer, uuid[], integer[], text[])
from public, anon, authenticated;
grant execute on function
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer, uuid[], integer[], text[])
to service_role;

-- ---------------------------------------------------------------------------
-- 2) Outfits in a cart (p_lines as create_order / cart_availability take them): sets and one-pieces, plus tops paired with pants.
--    Lines whose style can't be read count as nothing (they fail on their own).
-- ---------------------------------------------------------------------------
create function public.cart_outfit_count(p_lines jsonb)
returns integer
language sql
stable
set search_path = ''
as $$
  select (count(*) filter (where s.category in ('suit', 'one_piece'))
          + least(count(*) filter (where s.category = 'jacket'), count(*) filter (where s.category = 'pants')))::integer
  from jsonb_array_elements(p_lines) l
  join public.styles s
    on l ->> 'style_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and s.id = (l ->> 'style_id')::uuid;
$$;

-- Add-ons of one kind ('helmet_cover' / 'gloves') in a cart
create function public.cart_addon_count(p_lines jsonb, p_category text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(p_lines) l
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(l -> 'addon_style_ids') = 'array' then l -> 'addon_style_ids' else '[]'::jsonb end
  ) a
  join public.styles s
    on a ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and s.id = a::uuid
  where s.category = p_category;
$$;

revoke execute on function public.cart_outfit_count(jsonb), public.cart_addon_count(jsonb, text) from public, anon, authenticated;
grant execute on function public.cart_outfit_count(jsonb), public.cart_addon_count(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- create_order: add-on sizes passed on; no more add-ons of a kind than outfits (same signature)
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
  v_outfits integer;
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

  -- One helmet cover and one pair of gloves at the add-on price per outfit
  v_outfits := public.cart_outfit_count(p_lines);
  if public.cart_addon_count(p_lines, 'helmet_cover') > v_outfits
     or public.cart_addon_count(p_lines, 'gloves') > v_outfits then
    raise exception 'addon_limit' using errcode = 'P0001';
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
        coalesce(array(select jsonb_array_elements_text(coalesce(v_line -> 'addon_cents', '[]'::jsonb))::integer), '{}'),
        coalesce(array(select jsonb_array_elements(coalesce(v_line -> 'addon_sizes', '[]'::jsonb)) #>> '{}'), '{}')
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

-- ---------------------------------------------------------------------------
-- 3) cart_availability: gloves add-ons in their size (same signature)
-- p_lines: [{ "style_id", "size" (null = any), "start", "end", "addon_style_ids": [...], "addon_sizes": [...] }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.cart_availability(p_lines jsonb)
returns table (line integer, fulfillment_method text, item_ok boolean, addons_ok boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_method text;
  v_padding record;
  v_buffer integer;
  v_line jsonb;
  v_index integer;
  v_style public.styles%rowtype;
  v_range daterange;
  v_parts uuid[];
  v_part uuid;
  v_addon record;
  v_item uuid;
  v_taken_items uuid[];
  v_taken_ranges daterange[];
  v_line_items uuid[];
  v_ok boolean;
  v_addons_ok boolean;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 10 then
    raise exception 'invalid_cart' using errcode = 'P0001';
  end if;
  select s.buffer_days into v_buffer from public.settings s where s.id;

  foreach v_method in array array['pickup', 'shipping'] loop
    select * into v_padding from public.fulfillment_padding(v_method);
    v_taken_items := '{}';
    v_taken_ranges := '{}';
    v_index := 0;

    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_index := v_index + 1;
      v_ok := true;
      v_addons_ok := true;
      v_line_items := '{}';
      begin
        v_range := daterange(
          (v_line ->> 'start')::date - v_padding.lead_days,
          (v_line ->> 'end')::date + 1 + v_padding.tail_days + v_buffer,
          '[)'
        );
        select * into v_style from public.styles s where s.id = (v_line ->> 'style_id')::uuid and s.is_active;
      exception
        when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or data_exception then
          v_style := null;
      end;

      if v_style.id is null then
        v_ok := false;
      else
        -- The item: a set takes one of each of its pieces, anything else one of its own (insert_booking_row's choice)
        v_parts := coalesce(v_style.bundle_style_ids, array[v_style.id]);
        foreach v_part in array v_parts loop
          select i.id into v_item
          from public.inventory_items i
          where i.style_id = v_part
            and ((v_line ->> 'size') is null or i.size = v_line ->> 'size')
            and i.status = 'available'
            and public.is_item_free(i.id, v_range)
            and not exists (
              select 1 from unnest(v_taken_items, v_taken_ranges) t(item_id, taken)
              where t.item_id = i.id and t.taken && v_range
            )
          order by i.code
          limit 1;
          if v_item is null then
            v_ok := false;
            exit;
          end if;
          v_line_items := v_line_items || v_item;
          v_taken_items := v_taken_items || v_item;
          v_taken_ranges := v_taken_ranges || v_range;
        end loop;

        if not v_ok then
          -- Give back the pieces of a set that couldn't be completed
          v_taken_items := v_taken_items[1 : coalesce(array_length(v_taken_items, 1), 0) - coalesce(array_length(v_line_items, 1), 0)];
          v_taken_ranges := v_taken_ranges[1 : coalesce(array_length(v_taken_ranges, 1), 0) - coalesce(array_length(v_line_items, 1), 0)];
        end if;

        -- Add-ons: a helmet cover (any piece) or gloves (in the chosen size)
        for v_addon in
          select a.value as style_id, v_line -> 'addon_sizes' ->> (a.ord - 1)::integer as size
          from jsonb_array_elements_text(
            case when jsonb_typeof(v_line -> 'addon_style_ids') = 'array' then v_line -> 'addon_style_ids' else '[]'::jsonb end
          ) with ordinality a(value, ord)
          where a.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        loop
          select i.id into v_item
          from public.inventory_items i
          join public.styles s on s.id = i.style_id and s.is_active and s.category in ('helmet_cover', 'gloves')
          where i.style_id = v_addon.style_id::uuid
            and (s.category = 'helmet_cover' or i.size = v_addon.size)
            and i.status = 'available'
            and public.is_item_free(i.id, v_range)
            and not exists (
              select 1 from unnest(v_taken_items, v_taken_ranges) t(item_id, taken)
              where t.item_id = i.id and t.taken && v_range
            )
          order by i.code
          limit 1;
          if v_item is null then
            v_addons_ok := false;
          else
            v_taken_items := v_taken_items || v_item;
            v_taken_ranges := v_taken_ranges || v_range;
          end if;
        end loop;
      end if;

      line := v_index;
      fulfillment_method := v_method;
      item_ok := v_ok;
      addons_ok := v_addons_ok;
      return next;
    end loop;
  end loop;
end;
$$;
