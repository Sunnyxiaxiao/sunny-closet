-- Sunny Closet: condition notes for pieces with visible flaws
--
-- Every piece is guaranteed to be fully functional; any minor flaw is disclosed before booking. For such a piece the admin writes a note (Chinese + English)
-- and uploads close-up photos on that piece (inventory_items). The product page shows them in a collapsed
-- "Condition notes" section, and checkout asks the customer to confirm they've seen them.
-- Flaws disclosed this way aren't charged as damage (rental terms).
--
-- inventory_items stays admin-only (it also holds purchase prices): the storefront reads these three columns
-- on the server with the service role.

alter table public.inventory_items
  add column condition_note text not null default '' check (length(condition_note) <= 1000),
  add column condition_note_en text not null default '' check (length(condition_note_en) <= 1000),
  add column condition_image_urls text[] not null default '{}' check (cardinality(condition_image_urls) <= 10);

-- Evidence on each order: the note and photos of the exact piece the order got, copied when it was placed
-- (later edits to the note don't change it), and when the customer confirmed seeing them.
-- Written only by the server (service_role); the admin reads them through the existing select grant.
alter table public.bookings
  add column condition_snapshot jsonb,
  add column condition_acknowledged_at timestamptz;
