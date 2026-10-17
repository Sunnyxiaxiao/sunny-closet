-- Sunny Closet：自动化测试用的演示数据（只在测试数据库里使用，不会写入 Supabase；可重复执行）
-- 每套雪服都是独一无二的：一个款式 = 一个展示页 = 通常只有一件库存。
-- 价格单位为“美分”：3200 = $32.00
-- category：suit 成套 / one_piece 连体服 / jacket 上衣 / pants 裤子

insert into public.styles (
  slug, brand, category, name, description, daily_price_cents, deposit_cents, image_urls, sort_order
)
values
  (
    'misty-blue-suit', 'ISEE MIGGA', 'suit', '雾霾蓝宽松滑雪套装',
    E'宽松廓形上衣 + 背带裤，雾霾蓝低饱和配色，拍照很出片。\n防水透气面料，适合初中级雪道。',
    3200, 20000, array['/demo/misty-blue-suit.svg', '/demo/misty-blue-suit-back.svg'], 10
  ),
  (
    'cream-white-suit', 'ISEE MIGGA', 'suit', '奶油白滑雪套装',
    E'奶油白上衣搭配同色系雪裤，干净温柔。\n浅色款每次归还后都会单独深度清洁。',
    3200, 20000, array['/demo/cream-white-suit.svg'], 20
  ),
  (
    'forest-green-suit', 'ISEE MIGGA', 'suit', '森林绿工装滑雪套装',
    E'工装风多口袋设计，森林绿配色耐脏好搭。\n裤腿带防雪套，适合单板。',
    3000, 20000, array['/demo/forest-green-suit.svg'], 30
  ),
  (
    'sunset-orange-suit', 'ISEE MIGGA', 'suit', '日落橙撞色滑雪套装',
    E'亮橙上衣 + 黑色雪裤，雪道上一眼就能找到你。',
    3000, 20000, array['/demo/sunset-orange-suit.svg'], 40
  ),
  (
    'midnight-black-suit', 'ISEE MIGGA', 'suit', '午夜黑滑雪套装',
    E'全黑经典款，显瘦百搭。',
    2800, 18000, array['/demo/midnight-black-suit.svg'], 50
  ),
  (
    'lavender-one-piece', '', 'one_piece', '薰衣草紫连体滑雪服',
    E'连体式设计，摔倒也不进雪，保暖性好。',
    3000, 20000, array['/demo/lavender-one-piece.svg'], 60
  ),
  (
    'charcoal-jacket', '', 'jacket', '炭灰滑雪上衣',
    E'单件上衣，适合已有雪裤的顾客。带雪裙和头盔兼容帽兜。',
    1800, 12000, array['/demo/charcoal-jacket.svg'], 70
  ),
  (
    'black-wide-pants', 'ISEE MIGGA', 'pants', '黑色阔腿滑雪裤',
    E'阔腿版型，腰围可调，搭配任何上衣都好看。',
    1400, 8000, array['/demo/black-wide-pants.svg'], 80
  )
on conflict (slug) do nothing;

insert into public.inventory_items (style_id, size, code, status)
select s.id, v.size, v.code, 'available'
from (
  values
    ('misty-blue-suit', 'M', 'SC001'),
    ('cream-white-suit', 'S', 'SC002'),
    ('forest-green-suit', 'L', 'SC003'),
    ('sunset-orange-suit', 'M', 'SC004'),
    ('midnight-black-suit', 'XL', 'SC005'),
    ('lavender-one-piece', 'S', 'SC006'),
    ('charcoal-jacket', 'M', 'SC007'),
    ('black-wide-pants', 'L', 'SC008')
) as v (style_slug, size, code)
join public.styles s on s.slug = v.style_slug
on conflict (code) do nothing;

-- 两条演示预订：方便演示“这段时间已被预订”
insert into public.bookings (
  booking_no, style_id, inventory_item_id, size, start_date, end_date, buffer_days, status,
  fulfillment_method, shipping_address, customer_name, customer_email, customer_phone,
  rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
)
select
  public.generate_booking_no(), s.id, i.id, i.size,
  current_date + v.start_offset, current_date + v.end_offset,
  (select buffer_days from public.settings where id),
  v.status, 'pickup', null, v.customer_name, 'demo@example.com', '000-000-0000',
  v.end_offset - v.start_offset + 1,
  s.daily_price_cents,
  s.daily_price_cents * (v.end_offset - v.start_offset + 1),
  s.deposit_cents,
  s.daily_price_cents * (v.end_offset - v.start_offset + 1) + s.deposit_cents
from (
  values
    ('SC001', 7, 9, 'confirmed', '演示顾客 A'),
    ('SC004', 8, 10, 'pending', '演示顾客 B')
) as v (item_code, start_offset, end_offset, status, customer_name)
join public.inventory_items i on i.code = v.item_code
join public.styles s on s.id = i.style_id
where not exists (
  select 1 from public.bookings b where b.customer_email = 'demo@example.com'
);
