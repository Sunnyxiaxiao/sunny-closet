-- Sunny Closet: one page per outfit
-- 1) Add "brand" and "category" to styles
-- 2) Remove the first round of demo data (including kids' styles). If any of these styles has real orders, the foreign key blocks the delete and errors instead of deleting by mistake.

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
