-- Sunny Closet: Mix & Match (jacket and pants rentals) + new full-set price table
--
-- Price tables (item n = total rental for n days, in cents):
--   Full set (set / one-piece): 1 day $49, 2 days $79, 3 days $94, 4 days $109, 5 days $119, 6 days $129, 7 days $139
--   Jacket only (category = 'jacket'): $35, $50, $60, $70, $80, $85, $90
--   Pants only (category = 'pants'):   $25, $35, $45, $55, $65, $70, $75
-- Styles with their own rental_prices_cents (helmet covers, gloves) still use their own.
-- create_booking validates prices with style_rental_price_cents, so changing this function alone makes orders charge by category.

alter table public.settings
  add column jacket_prices_cents integer[] not null
    default array[3500, 5000, 6000, 7000, 8000, 8500, 9000],
  add column pants_prices_cents integer[] not null
    default array[2500, 3500, 4500, 5500, 6500, 7000, 7500],
  add constraint settings_jacket_prices_valid check (
    array_length(jacket_prices_cents, 1) between 1 and 31
    and array_position(jacket_prices_cents, null) is null
    and 0 <= all (jacket_prices_cents)
  ),
  add constraint settings_pants_prices_valid check (
    array_length(pants_prices_cents, 1) between 1 and 31
    and array_position(pants_prices_cents, null) is null
    and 0 <= all (pants_prices_cents)
  );

update public.settings
set rental_prices_cents = array[4900, 7900, 9400, 10900, 11900, 12900, 13900]
where id;

-- Rental for a style for p_days days: the style's own table → jacket / pants table → full-set table
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
      case st.category
        when 'jacket' then s.jacket_prices_cents
        when 'pants' then s.pants_prices_cents
        else s.rental_prices_cents
      end
    ) as prices
    from public.styles st
    cross join public.settings s
    where st.id = p_style_id and s.id
  ) p
  where p_days >= 1;
$$;

-- daily_price_cents is only shown as the "from" price; sync it to tier 1 of the new tables
update public.styles st
set daily_price_cents = case st.category
  when 'jacket' then s.jacket_prices_cents[1]
  when 'pants' then s.pants_prices_cents[1]
  else s.rental_prices_cents[1]
end
from public.settings s
where s.id and st.rental_prices_cents is null;
