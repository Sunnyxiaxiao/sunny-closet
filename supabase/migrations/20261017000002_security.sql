-- Sunny Closet：管理员、行级安全（RLS）与权限
-- 原则：匿名访客（anon）只能读上架商品、调用可用性查询；
--      预订只能经由服务端（service_role）调用 create_booking 提交；
--      订单与顾客信息只有管理员可读写。

-- ---------------------------------------------------------------------------
-- 管理员名单
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
-- 先收回所有默认权限，再按需授予
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
-- 开启 RLS
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.styles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.bookings enable row level security;
alter table public.rate_limits enable row level security;
alter table public.admin_users enable row level security;

-- settings：所有人可读（前台需要缓冲天数等），管理员可改
grant select on public.settings to anon, authenticated;
grant update (buffer_days, max_rental_days) on public.settings to authenticated;

create policy settings_read on public.settings
  for select to anon, authenticated
  using (true);

create policy settings_admin_update on public.settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- styles：访客只能看上架的；管理员可看全部、新增、编辑（不提供删除，用“停用”代替）
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

-- inventory_items：仅管理员（访客通过 get_availability 只拿到件数）
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

-- bookings：仅管理员可读、可改状态与备注；任何人都不能直接 insert/delete
grant select on public.bookings to authenticated;
grant update (status, admin_note) on public.bookings to authenticated;

create policy bookings_admin_select on public.bookings
  for select to authenticated
  using (public.is_admin());

create policy bookings_admin_update on public.bookings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- admin_users：已登录用户只能看到自己那一行（用于判断自己是不是管理员）
grant select on public.admin_users to authenticated;

create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (user_id = auth.uid());

-- rate_limits：不开放给 anon / authenticated，只有 service_role 使用

-- ---------------------------------------------------------------------------
-- 函数执行权限
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
