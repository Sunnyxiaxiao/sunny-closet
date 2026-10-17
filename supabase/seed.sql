-- Sunny Closet：演示用种子数据（可重复执行，不会重复插入）
-- 价格单位为“美分”：2800 = $28.00

insert into public.styles (slug, name, description, daily_price_cents, deposit_cents, image_urls, sort_order)
values
  (
    'adult-ski-suit',
    '成人雪服套装',
    '上衣 + 背带裤一整套，防水透气，适合初中级滑雪者。每次归还后都会专业清洗消毒。',
    2800, 15000, array['/demo/adult-ski-suit.svg'], 10
  ),
  (
    'kids-ski-suit',
    '儿童雪服套装',
    '连体式儿童雪服，加厚保暖，膝盖与臀部加固耐磨。适合 3–10 岁小朋友。',
    1800, 8000, array['/demo/kids-ski-suit.svg'], 20
  ),
  (
    'adult-ski-jacket',
    '成人滑雪外套',
    '单件滑雪外套，带雪裙与头盔兼容帽兜，适合已有雪裤的顾客。',
    1600, 10000, array['/demo/adult-ski-jacket.svg'], 30
  ),
  (
    'adult-ski-pants',
    '成人滑雪裤',
    '单条背带滑雪裤，防水耐磨，腰围可调。',
    1200, 6000, array['/demo/adult-ski-pants.svg'], 40
  )
on conflict (slug) do nothing;

insert into public.inventory_items (style_id, size, code, status)
select s.id, v.size, v.code, v.status
from (
  values
    ('adult-ski-suit', 'S', 'AS-S-01', 'available'),
    ('adult-ski-suit', 'S', 'AS-S-02', 'available'),
    ('adult-ski-suit', 'M', 'AS-M-01', 'available'),
    ('adult-ski-suit', 'M', 'AS-M-02', 'available'),
    ('adult-ski-suit', 'M', 'AS-M-03', 'available'),
    ('adult-ski-suit', 'L', 'AS-L-01', 'available'),
    ('adult-ski-suit', 'L', 'AS-L-02', 'available'),
    ('adult-ski-suit', 'L', 'AS-L-03', 'available'),
    ('adult-ski-suit', 'XL', 'AS-XL-01', 'available'),
    ('adult-ski-suit', 'XL', 'AS-XL-02', 'available'),
    ('kids-ski-suit', '110', 'KS-110-01', 'available'),
    ('kids-ski-suit', '110', 'KS-110-02', 'available'),
    ('kids-ski-suit', '120', 'KS-120-01', 'available'),
    ('kids-ski-suit', '120', 'KS-120-02', 'available'),
    ('kids-ski-suit', '130', 'KS-130-01', 'available'),
    ('kids-ski-suit', '130', 'KS-130-02', 'available'),
    ('kids-ski-suit', '140', 'KS-140-01', 'available'),
    ('adult-ski-jacket', 'S', 'AJ-S-01', 'available'),
    ('adult-ski-jacket', 'M', 'AJ-M-01', 'available'),
    ('adult-ski-jacket', 'M', 'AJ-M-02', 'available'),
    ('adult-ski-jacket', 'L', 'AJ-L-01', 'available'),
    ('adult-ski-jacket', 'L', 'AJ-L-02', 'available'),
    ('adult-ski-pants', 'S', 'AP-S-01', 'available'),
    ('adult-ski-pants', 'M', 'AP-M-01', 'available'),
    ('adult-ski-pants', 'M', 'AP-M-02', 'inactive'),
    ('adult-ski-pants', 'L', 'AP-L-01', 'available')
) as v (style_slug, size, code, status)
join public.styles s on s.slug = v.style_slug
on conflict (code) do nothing;

-- 两条演示预订：把“成人雪服套装 S 码”的两件都占掉一段时间，方便演示“无货”
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
    ('AS-S-01', 7, 9, 'confirmed', '演示顾客 A'),
    ('AS-S-02', 8, 10, 'pending', '演示顾客 B')
) as v (item_code, start_offset, end_offset, status, customer_name)
join public.inventory_items i on i.code = v.item_code
join public.styles s on s.id = i.style_id
where not exists (
  select 1 from public.bookings b where b.customer_email = 'demo@example.com'
);
