-- Sunny Closet: bib pants at jacket prices, hoodies at pants prices
--
-- Separately rented tops / pants are priced by category by default (jacket table, pants table). Two exceptions are marked by tags:
--   - Pants tagged 'bib' (bib pants): jacket table
--   - Tops tagged 'hoodie': pants table
-- Deposits are unchanged and still come from the style's deposit_cents.

create or replace function public.style_rental_price_cents(p_style_id uuid, p_days integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select p.prices[least(p_days, array_length(p.prices, 1))]
  from (
    select coalesce(
      st.rental_prices_cents,
      case
        when st.category = 'pants' and 'bib' = any (st.tags) then s.jacket_prices_cents
        when st.category = 'jacket' and 'hoodie' = any (st.tags) then s.pants_prices_cents
        when st.category = 'jacket' then s.jacket_prices_cents
        when st.category = 'pants' then s.pants_prices_cents
        else s.rental_prices_cents
      end
    ) as prices
    from public.styles st
    cross join public.settings s
    where st.id = p_style_id and s.id
  ) p
  where p_days >= 1;
$$;
