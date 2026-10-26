-- Sunny Closet：评价表按最小权限收紧登录用户能读的列
--
-- 之前登录用户（authenticated）能读 reviews 的所有列，包括 booking_id、status。
-- 现在和访客对齐，只开放商品页展示需要的列。
-- 列权限是按数据库角色授的，没法只给管理员多开几列；管理员后台改走 admin_list_reviews()，
-- 函数里先核对是不是管理员，再返回整行。

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
