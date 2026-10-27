-- Sunny Closet: gloves
--
-- Gloves are also a "style" (styles.category = 'gloves') and reuse the existing tables and functions for inventory, scheduling and overbooking.
-- Gloves are priced by their own table (rental_prices_cents, e.g. 1 day $10, 2 days $18, 3+ days $25) and aren't offered as outfit add-ons.
-- When a style comes in several colors, each item's size is written as 「color · size」, e.g. 「芭比玫红 · S」;
-- variant_images maps each color to an index into image_urls (0-based), so picking a color switches to that image.

alter table public.styles drop constraint styles_category_check;

alter table public.styles
  add constraint styles_category_check
    check (category in ('suit', 'one_piece', 'jacket', 'pants', 'helmet_cover', 'gloves')),
  add column variant_images jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variant_images) = 'object'),
  add constraint styles_gloves_fields check (category <> 'gloves' or rental_prices_cents is not null);
