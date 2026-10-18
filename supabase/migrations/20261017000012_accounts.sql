-- Sunny Closet：顾客账号 + 后台改价格
--
-- 1) 顾客资料 profiles：注册后保存姓名、手机号、微信号，下单时自动填好。每个人只能读写自己的那一行。
-- 2) 订单 bookings.user_id：登录状态下提交的订单记在这个账号名下，“我的账号”页面可以看到。
--    订单仍然只由服务端（service_role）读写，顾客不能直接查订单表。
-- 3) 后台可以修改价目表和邮寄最短天数（只有管理员能改，见 settings_admin_update 策略）。

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
