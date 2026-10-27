-- Sunny Closet: jacket-only styles can offer a "top + random black snow pants" option
--
-- How: bundles may now have a single separate. The set is charged by the set price table and occupies that top's inventory when ordered,
-- so it never double-books with the top rented alone; the black pants are a shop basic, assigned at random and not tracked as inventory.
-- Pages use the 'with-black-pants' tag to tell this set apart from multi-piece bundles curated by the owner.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
  where con.conrelid = 'public.styles'::regclass
    and con.contype = 'c'
    and att.attname = 'bundle_style_ids';
  if v_name is not null then
    execute format('alter table public.styles drop constraint %I', v_name);
  end if;
end;
$$;

alter table public.styles
  add constraint styles_bundle_style_ids_check check (bundle_style_ids is null or (
    cardinality(bundle_style_ids) between 1 and 5
    and array_position(bundle_style_ids, null) is null
  ));
