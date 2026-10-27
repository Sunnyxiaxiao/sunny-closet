-- Sunny Closet: listing real products
-- 1) Add a "source URL" to styles (when images and specs come from the brand's site, the product page credits the source)
-- 2) Remove the second round of demo data. If any of these styles has real orders, the foreign key blocks the delete and errors instead of deleting by mistake.

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
