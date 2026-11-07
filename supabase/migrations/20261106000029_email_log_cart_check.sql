-- Sunny Closet: order email log, and a whole-cart availability check
--
-- 1) Every order email (new order, confirmation, refund due, short-notice acceptance...) is recorded before it is sent and
--    marked sent or failed after. The scheduled sweep retries failed ones a few times; the admin sees the ones that still
--    failed and can resend them, or dismiss them (no longer needed). Written only by the server (service role); admins can read.
-- 2) cart_availability: whether each cart item (and its add-on) can be had for pickup / for shipping, allocating the whole
--    cart the way create_order does (first free piece by code; a set takes one of each of its pieces; add-ons take a piece too;
--    pieces taken by earlier items in the cart aren't free for later ones). Read only: nothing is written or locked.
--    Order submission still checks for real, in its own transaction.

-- ---------------------------------------------------------------------------
-- 1) Order email log
-- ---------------------------------------------------------------------------
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in (
    'new_order', 'order_confirmed', 'refund_due', 'awaiting_acceptance', 'order_declined', 'acceptance_reminder'
  )),
  -- What the email needs besides the order (refund amount and reason, reply deadline)
  params jsonb not null default '{}',
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'dismissed')),
  attempts integer not null default 1 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_log_booking_idx on public.email_log (booking_id);
create index email_log_unsent_idx on public.email_log (updated_at) where status in ('sending', 'failed');

alter table public.email_log enable row level security;

create policy email_log_admin_select on public.email_log
  for select to authenticated using (public.is_admin());

revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;

-- ---------------------------------------------------------------------------
-- 2) Whole-cart availability
-- ---------------------------------------------------------------------------
-- p_lines: [{ "style_id", "size" (null = any), "start", "end", "addon_style_ids": [...] }, ...] (at most 10)
-- One row per item and fulfillment method: whether the item itself (a set: all its pieces) and its add-ons can be had.
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
  v_addon uuid;
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

        -- Add-ons (helmet covers, any size)
        for v_addon in
          select a::uuid from jsonb_array_elements_text(
            case when jsonb_typeof(v_line -> 'addon_style_ids') = 'array' then v_line -> 'addon_style_ids' else '[]'::jsonb end
          ) a
        loop
          select i.id into v_item
          from public.inventory_items i
          join public.styles s on s.id = i.style_id and s.is_active and s.category = 'helmet_cover'
          where i.style_id = v_addon
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

revoke execute on function public.cart_availability(jsonb) from public;
grant execute on function public.cart_availability(jsonb) to anon, authenticated, service_role;
