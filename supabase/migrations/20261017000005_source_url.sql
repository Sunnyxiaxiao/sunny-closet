-- Sunny Closet：真实商品上架
-- 1) 款式新增“来源链接”（图片与参数来自品牌官网时，详情页注明出处）
-- 2) 清理第二版演示数据。若这些款式已有真实订单，外键会阻止删除并报错，不会误删。

alter table public.styles
  add column source_url text not null default '';

delete from public.bookings b
using public.styles s
where b.style_id = s.id
  and s.slug in (
    'misty-blue-suit', 'cream-white-suit', 'forest-green-suit', 'sunset-orange-suit',
    'midnight-black-suit', 'lavender-one-piece', 'charcoal-jacket', 'black-wide-pants'
  )
  and b.customer_email = 'demo@example.com';

delete from public.inventory_items i
using public.styles s
where i.style_id = s.id
  and s.slug in (
    'misty-blue-suit', 'cream-white-suit', 'forest-green-suit', 'sunset-orange-suit',
    'midnight-black-suit', 'lavender-one-piece', 'charcoal-jacket', 'black-wide-pants'
  );

delete from public.styles
where slug in (
  'misty-blue-suit', 'cream-white-suit', 'forest-green-suit', 'sunset-orange-suit',
  'midnight-black-suit', 'lavender-one-piece', 'charcoal-jacket', 'black-wide-pants'
);
