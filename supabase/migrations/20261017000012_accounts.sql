-- Sunny Closet: customer accounts + editing prices in admin
--
-- 1) Customer profiles: name, phone and WeChat saved after sign-up and prefilled at checkout. Everyone can only read and write their own row.
-- 2) bookings.user_id: orders submitted while signed in are linked to the account and shown on "My account".
--    Bookings are still read and written only by the server (service_role); customers can't query the table directly.
-- 3) The admin can edit the price tables and minimum shipping days (admin only, see the settings_admin_update policy).

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 60),
  phone text not null default '' check (char_length(phone) <= 25),
  wechat text not null default '' check (char_length(wechat) <= 60),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create policy profiles_own_select on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_own_insert on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy profiles_own_update on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.bookings
  add column user_id uuid references auth.users (id) on delete set null;

create index bookings_user_id_idx on public.bookings (user_id);

grant update (rental_prices_cents, jacket_prices_cents, pants_prices_cents, shipping_min_days)
  on public.settings to authenticated;
