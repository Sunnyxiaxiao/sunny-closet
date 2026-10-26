-- Sunny Closet：顾客评价
--
-- 订单归还后（管理员把状态改成 returned），顾客可以在订单页写一条评价。
-- 每笔订单最多一条。新评价是 pending，只有管理员看得到；管理员选择发布（published）后才出现在网站上，
-- 不想展示的可以隐藏（hidden）。
-- 顾客提交走服务端（核对订单编号和状态后用服务密钥写入），所以 anon / authenticated 都不能直接 insert。

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  style_id uuid not null references public.styles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (length(trim(body)) between 1 and 2000),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  -- 顾客写评价时用的语言，前台按语言分开展示
  locale text not null default 'zh' check (locale in ('zh', 'en')),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reviews_style_published_idx on public.reviews (style_id, published_at desc) where status = 'published';
create index reviews_status_idx on public.reviews (status, created_at desc);

create trigger reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;
revoke all on table public.reviews from anon, authenticated;

-- 访客：只能看到已发布的评价，而且只给展示需要的字段（不含 booking_id）
grant select (id, style_id, rating, body, display_name, locale, published_at) on public.reviews to anon;
create policy reviews_public_select on public.reviews
  for select to anon
  using (status = 'published');

-- 登录用户：已发布的都能看；管理员能看全部，并且能改状态
grant select on public.reviews to authenticated;
grant update (status, published_at) on public.reviews to authenticated;
create policy reviews_authenticated_select on public.reviews
  for select to authenticated
  using (status = 'published' or public.is_admin());
create policy reviews_admin_update on public.reviews
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
