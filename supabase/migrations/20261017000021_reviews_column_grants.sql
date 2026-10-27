-- Sunny Closet: least-privilege columns on reviews for signed-in users
--
-- Previously, signed-in users (authenticated) could read every column of reviews, including booking_id and status.
-- They now match visitors and only get the columns the product page displays.
-- Column grants are per database role, so the admin can't get extra columns alone; the admin dashboard uses admin_list_reviews() instead,
-- which checks for admin first and then returns full rows.

revoke select on public.reviews from authenticated;
grant select (id, style_id, rating, body, display_name, locale, published_at) on public.reviews to authenticated;

create function public.admin_list_reviews()
returns setof public.reviews
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select * from public.reviews;
end;
$$;

revoke execute on function public.admin_list_reviews() from public, anon, authenticated;
grant execute on function public.admin_list_reviews() to authenticated;
