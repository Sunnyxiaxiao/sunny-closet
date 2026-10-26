-- Sunny Closet：背带雪裤按外套价、卫衣按雪裤价
--
-- 单租的上衣 / 雪裤默认按品类计价（外套价目表、雪裤价目表）。两个例外靠标签区分：
--   - 雪裤带 'bib' 标签（背带雪裤）：按外套价目表
--   - 上衣带 'hoodie' 标签（卫衣）：按雪裤价目表
-- 押金不变，仍按款式自己填的 deposit_cents。

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
