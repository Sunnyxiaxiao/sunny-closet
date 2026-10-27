-- Sunny Closet: admins, row-level security (RLS) and privileges
-- Principles: anonymous visitors (anon) can only read active products and call the availability query;
--      bookings can only be submitted by the server (service_role) through create_booking;
--      orders and customer data are readable and writable by the admin only.

-- ---------------------------------------------------------------------------
-- Admin list
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Revoke every default privilege first, then grant only what is needed
-- ---------------------------------------------------------------------------
revoke all on table
  public.settings,
  public.styles,
  public.inventory_items,
  public.bookings,
  public.rate_limits,
  public.admin_users
from anon, authenticated;

revoke execute on function
  public.set_updated_at(),
  public.is_blocking_status(text),
  public.hit_rate_limit(text, text, integer, integer),
  public.generate_booking_no(),
  public.get_availability(date, date, uuid),
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer),
  public.is_admin()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.styles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.bookings enable row level security;
alter table public.rate_limits enable row level security;
alter table public.admin_users enable row level security;

-- settings: readable by everyone (the storefront needs buffer days etc.), editable by the admin
grant select on public.settings to anon, authenticated;
grant update (buffer_days, max_rental_days) on public.settings to authenticated;

create policy settings_read on public.settings
  for select to anon, authenticated
  using (true);

create policy settings_admin_update on public.settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- styles: visitors see active styles only; the admin can see all, insert and edit (no delete; deactivate instead)
grant select on public.styles to anon, authenticated;
grant insert, update on public.styles to authenticated;

create policy styles_public_read on public.styles
  for select to anon, authenticated
  using (is_active or public.is_admin());

create policy styles_admin_insert on public.styles
  for insert to authenticated
  with check (public.is_admin());

create policy styles_admin_update on public.styles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- inventory_items: admin only (visitors only get counts through get_availability)
grant select, insert, update on public.inventory_items to authenticated;

create policy inventory_admin_select on public.inventory_items
  for select to authenticated
  using (public.is_admin());

create policy inventory_admin_insert on public.inventory_items
  for insert to authenticated
  with check (public.is_admin());

create policy inventory_admin_update on public.inventory_items
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- bookings: admin only can read and change status and notes; nobody can insert/delete directly
grant select on public.bookings to authenticated;
grant update (status, admin_note) on public.bookings to authenticated;

create policy bookings_admin_select on public.bookings
  for select to authenticated
  using (public.is_admin());

create policy bookings_admin_update on public.bookings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- admin_users: signed-in users can only see their own row (to check whether they are an admin)
grant select on public.admin_users to authenticated;

create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- rate_limits: not exposed to anon / authenticated; used by service_role only

-- ---------------------------------------------------------------------------
-- Function execute privileges
-- ---------------------------------------------------------------------------
grant execute on function public.is_blocking_status(text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.get_availability(date, date, uuid) to anon, authenticated;

grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.generate_booking_no() to service_role;
grant execute on function
  public.create_booking(uuid, text, date, date, text, text, text, text, text, text, integer, integer, integer)
to service_role;

grant all on table
  public.settings,
  public.styles,
  public.inventory_items,
  public.bookings,
  public.rate_limits,
  public.admin_users
to service_role;
