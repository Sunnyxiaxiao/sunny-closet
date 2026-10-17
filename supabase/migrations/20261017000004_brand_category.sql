-- Sunny Closet：每套雪服独立展示
-- 1) 款式新增“品牌”和“品类”
-- 2) 清理第一版演示数据（含儿童款）。若这些款式已有真实订单，外键会阻止删除并报错，不会误删。

alter table public.styles
  add column brand text not null default '',
  add column category text not null default 'suit'
    check (category in ('suit', 'one_piece', 'jacket', 'pants'));

delete from public.bookings b
using public.styles s
where b.style_id = s.id
  and s.slug in ('adult-ski-suit', 'kids-ski-suit', 'adult-ski-jacket', 'adult-ski-pants')
  and b.customer_email = 'demo@example.com';

delete from public.inventory_items i
using public.styles s
where i.style_id = s.id
  and s.slug in ('adult-ski-suit', 'kids-ski-suit', 'adult-ski-jacket', 'adult-ski-pants');

delete from public.styles
where slug in ('adult-ski-suit', 'kids-ski-suit', 'adult-ski-jacket', 'adult-ski-pants');
