-- Items not returned on time keep holding their piece (audit #5)
--
-- A picked-up order that wasn't marked returned holds its piece past its booked range:
--   - with an expected return date that hasn't passed: until that date + 1 + cleaning days;
--   - otherwise, once overdue (past the scheduled return day): rolling until today + settings.overdue_hold_days,
--     moving forward every day, so the piece never becomes free on its own; only "returned" releases it.
-- The stored blocked_range (and its exclusion constraint) can't depend on today, so the extra hold is applied
-- wherever availability is checked (is_item_free, add_inventory_block); those run under the piece's row lock.
-- When an extended hold runs into an order already booked on the piece, nothing is changed: the admin sees the
-- conflict (overdue_conflicts) and gets one alert email per affected order (overdue_conflict_alerted_at).

alter table public.settings
  add column overdue_hold_days integer not null default 7 check (overdue_hold_days between 1 and 60);

alter table public.bookings
  add column expected_return_date date,
  add column overdue_conflict_alerted_at timestamptz;

-- The range an order holds today: its booked range, extended for a picked-up order that's late or has an expected return date
create or replace function public.booking_hold_range(
  p_status text,
  p_blocked_range daterange,
  p_end date,
  p_tail_days integer,
  p_buffer_days integer,
  p_expected_return date
)
returns daterange
language sql
stable
set search_path = ''
as $$
  select case
    when p_status <> 'picked_up' then p_blocked_range
    when p_expected_return is not null and p_expected_return >= current_date then
      daterange(lower(p_blocked_range), greatest(upper(p_blocked_range), p_expected_return + 1 + p_buffer_days), '[)')
    when current_date > p_end + 1 + p_tail_days then
      daterange(
        lower(p_blocked_range),
        greatest(upper(p_blocked_range), current_date + 1 + (select s.overdue_hold_days from public.settings s where s.id)),
        '[)'
      )
    else p_blocked_range
  end;
$$;

create or replace function public.is_item_free(p_item_id uuid, p_range daterange)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
      select 1 from public.bookings b
      where b.inventory_item_id = p_item_id
        and public.is_blocking_status(b.status)
        and public.booking_hold_range(b.status, b.blocked_range, b.end_date, b.tail_days, b.buffer_days, b.expected_return_date)
          && p_range
    )
    and not exists (
      select 1 from public.inventory_blocks k
      where k.inventory_item_id = p_item_id
        and k.blocked_range && p_range
    );
$$;

-- Manual blocks: same as before, but an overdue order's extended hold counts as a conflict too
create or replace function public.add_inventory_block(p_item_id uuid, p_start date, p_end date, p_reason text)
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
    and public.booking_hold_range(b.status, b.blocked_range, b.end_date, b.tail_days, b.buffer_days, b.expected_return_date)
      && daterange(p_start, p_end + 1, '[)')
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

-- Picked-up orders whose current hold runs into another order on the same piece (admin list + the alert sweep).
-- Runs as the caller: admins and the service role see every order, anyone else only rows their policies allow.
create function public.overdue_conflicts()
returns table (
  late_booking_id uuid,
  late_booking_no text,
  item_code text,
  hold_until date,
  booking_id uuid,
  booking_no text,
  start_date date,
  alerted_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.booking_no, i.code, (upper(h.range) - 1)::date,
         b.id, b.booking_no, b.start_date, b.overdue_conflict_alerted_at
  from public.bookings l
  cross join lateral (
    select public.booking_hold_range(l.status, l.blocked_range, l.end_date, l.tail_days, l.buffer_days, l.expected_return_date) as range
  ) h
  join public.inventory_items i on i.id = l.inventory_item_id
  join public.bookings b
    on b.inventory_item_id = l.inventory_item_id
   and b.id <> l.id
   and public.is_blocking_status(b.status)
   and b.status <> 'picked_up'
   and b.blocked_range && h.range
  where l.status = 'picked_up'
    and h.range <> l.blocked_range
  order by b.start_date;
$$;

revoke execute on function public.overdue_conflicts() from public, anon;
grant execute on function public.overdue_conflicts() to authenticated, service_role;

-- Sets (or clears, with null) a picked-up order's expected return date (admin only), for the order and its picked-up
-- add-on pieces, under their pieces' row locks. When the new hold would run into other orders, nothing is saved
-- unless p_confirm: raises 'return_conflict <order nos>'.
create function public.set_expected_return_date(p_booking_id uuid, p_date date, p_confirm boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_conflicts text;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_date is not null and p_date < current_date then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;

  select array_agg(b.id) into v_ids
  from public.bookings b
  where (b.id = p_booking_id or b.parent_booking_id = p_booking_id) and b.status = 'picked_up';

  perform 1 from public.inventory_items i
  where i.id in (select b.inventory_item_id from public.bookings b where b.id = any(v_ids))
  order by i.id
  for update;

  if not exists (select 1 from public.bookings b where b.id = p_booking_id and b.status = 'picked_up') then
    raise exception 'not_picked_up' using errcode = 'P0001';
  end if;

  select string_agg(distinct o.booking_no, ',') into v_conflicts
  from public.bookings l
  join public.bookings o
    on o.inventory_item_id = l.inventory_item_id
   and o.id <> all(v_ids)
   and public.is_blocking_status(o.status)
   and o.blocked_range && public.booking_hold_range(l.status, l.blocked_range, l.end_date, l.tail_days, l.buffer_days, p_date)
  where l.id = any(v_ids);
  if v_conflicts is not null and not p_confirm then
    raise exception 'return_conflict %', v_conflicts using errcode = 'P0001';
  end if;

  update public.bookings set expected_return_date = p_date where id = any(v_ids);
end;
$$;

revoke execute on function public.set_expected_return_date(uuid, date, boolean) from public, anon;
grant execute on function public.set_expected_return_date(uuid, date, boolean) to authenticated, service_role;
