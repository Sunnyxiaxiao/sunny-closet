-- 每件库存的采购价（美分），只有管理员看得到（inventory_items 本来就只对管理员开放）。
-- 不填 = 还没录入，统计总成本时单独提示有几件没填。
alter table public.inventory_items
  add column purchase_cents integer check (purchase_cents is null or purchase_cents >= 0);
