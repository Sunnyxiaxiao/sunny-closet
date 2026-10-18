-- Sunny Closet：Mix & Match（外套、雪裤单租）+ 新的成套价目表
--
-- 价目表（第 n 项 = 租 n 天的总租金，美分）：
--   完整套装（成套 / 连体服）：1 天 $49、2 天 $79、3 天 $94、4 天 $109、5 天 $119、6 天 $129、7 天 $139
--   只租外套（category = 'jacket'）：$35、$50、$60、$70、$80、$85、$90
--   只租雪裤（category = 'pants'）：  $25、$35、$45、$55、$65、$70、$75
-- 款式自己填了 rental_prices_cents（头盔套、手套）时仍以款式自己的为准。
-- create_booking 用 style_rental_price_cents 校验价格，所以只要改这个函数，下单时就按品类收费。

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

-- 某个款式租 p_days 天的租金：款式自己的价目表 → 外套 / 雪裤价目表 → 完整套装价目表
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

-- daily_price_cents 只用作“起价”展示，按新的价目表第 1 档同步
update public.styles st
set daily_price_cents = case st.category
  when 'jacket' then s.jacket_prices_cents[1]
  when 'pants' then s.pants_prices_cents[1]
  else s.rental_prices_cents[1]
end
from public.settings s
where s.id and st.rental_prices_cents is null;
