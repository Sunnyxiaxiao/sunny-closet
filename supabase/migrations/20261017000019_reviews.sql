-- Sunny Closet: customer reviews
--
-- After an order is returned (the admin sets its status to returned), the customer can write a review on the order page.
-- At most one per order. New reviews are pending and visible to the admin only; they appear on the site only after the admin publishes them (published),
-- and unwanted ones can be hidden (hidden).
-- Customers submit through the server (which checks the order number and status, then writes with the service key), so neither anon nor authenticated can insert directly.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  style_id uuid not null references public.styles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (length(trim(body)) between 1 and 2000),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  -- The language the review was written in; the storefront shows reviews per language
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

-- Visitors: only published reviews, and only the columns needed for display (no booking_id)
grant select (id, style_id, rating, body, display_name, locale, published_at) on public.reviews to anon;
create policy reviews_public_select on public.reviews
  for select to anon
  using (status = 'published');

-- Signed-in users: all published reviews; the admin sees everything and can change the status
grant select on public.reviews to authenticated;
grant update (status, published_at) on public.reviews to authenticated;
create policy reviews_authenticated_select on public.reviews
  for select to authenticated
  using (status = 'published' or public.is_admin());
create policy reviews_admin_update on public.reviews
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
