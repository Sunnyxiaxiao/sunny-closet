-- Purchase cost per inventory item (cents), visible to the admin only (inventory_items is already admin-only).
-- Empty = not entered yet; the total cost report flags how many are missing.
alter table public.inventory_items
  add column purchase_cents integer check (purchase_cents is null or purchase_cents >= 0);
