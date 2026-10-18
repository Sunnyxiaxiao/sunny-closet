-- Sunny Closet：手套
--
-- 手套也是一个“款式”（styles.category = 'gloves'），库存、排期、防超订沿用原来的表和函数。
-- 手套按自己的价目表计价（rental_prices_cents，例如 1 天 $10、2 天 $18、3 天及以上 $25），不参与雪服加购。
-- 一个款式有多种颜色时，每件库存的 size 写成「颜色 · 尺码」，例如「芭比玫红 · S」；
-- variant_images 记录每个颜色对应 image_urls 里的第几张图（从 0 开始），选颜色时换到那张图。

alter table public.styles drop constraint styles_category_check;

alter table public.styles
  add constraint styles_category_check
    check (category in ('suit', 'one_piece', 'jacket', 'pants', 'helmet_cover', 'gloves')),
  add column variant_images jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variant_images) = 'object'),
  add constraint styles_gloves_fields check (category <> 'gloves' or rental_prices_cents is not null);
