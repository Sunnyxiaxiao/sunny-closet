-- Sunny Closet：Crystal Collection 雪服的正价 + 感恩节 & 圣诞特惠
--
-- 带 'crystal' 标签的雪服（成套 / 连体服 / 上衣 / 雪裤）有自己的正价表（大约是普通价 × 59/49）：
--   成套：$59、$95、$113、$131、$143、$155、$167
--   上衣：$42、$60、$72、$84、$96、$102、$108
--   雪裤：$30、$42、$54、$66、$78、$84、$90
-- 特惠期内（店铺所在时区的今天 ≤ crystal_promo_ends_on）按普通价收，页面上把正价划掉；
-- 过了截止日自动恢复正价。crystal_promo_ends_on 为空表示没有特惠。
-- 手套、头盔套有自己的 rental_prices_cents，不受影响。

alter table public.settings
  add column crystal_prices_cents integer[] not null
    default array[5900, 9500, 11300, 13100, 14300, 15500, 16700],
  add column crystal_jacket_prices_cents integer[] not null
    default array[4200, 6000, 7200, 8400, 9600, 10200, 10800],
  add column crystal_pants_prices_cents integer[] not null
    default array[3000, 4200, 5400, 6600, 7800, 8400, 9000],
  add column crystal_promo_ends_on date default date '2026-12-25',
  add constraint settings_crystal_prices_valid check (
    array_length(crystal_prices_cents, 1) between 1 and 31
    and array_length(crystal_jacket_prices_cents, 1) between 1 and 31
    and array_length(crystal_pants_prices_cents, 1) between 1 and 31
    and array_position(crystal_prices_cents, null) is null
    and array_position(crystal_jacket_prices_cents, null) is null
    and array_position(crystal_pants_prices_cents, null) is null
    and 0 <= all (crystal_prices_cents)
    and 0 <= all (crystal_jacket_prices_cents)
    and 0 <= all (crystal_pants_prices_cents)
  );

grant update (
  crystal_prices_cents, crystal_jacket_prices_cents, crystal_pants_prices_cents, crystal_promo_ends_on
) on public.settings to authenticated;

-- 特惠是否还在进行（按店铺时区 America/New_York 的日期）
create or replace function public.crystal_promo_active()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (now() at time zone 'America/New_York')::date <= s.crystal_promo_ends_on,
    false
  )
  from public.settings s
  where s.id;
$$;

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
        -- 先按品类定用哪张表（背带雪裤按上衣、卫衣按雪裤），Crystal 款过了特惠期用正价表
        when b.kind = 'jacket' and b.crystal then s.crystal_jacket_prices_cents
        when b.kind = 'jacket' then s.jacket_prices_cents
        when b.kind = 'pants' and b.crystal then s.crystal_pants_prices_cents
        when b.kind = 'pants' then s.pants_prices_cents
        when b.crystal then s.crystal_prices_cents
        else s.rental_prices_cents
      end
    ) as prices
    from public.styles st
    cross join public.settings s
    cross join lateral (
      select
        case
          when st.category = 'pants' and 'bib' = any (st.tags) then 'jacket'
          when st.category = 'jacket' and 'hoodie' = any (st.tags) then 'pants'
          when st.category in ('jacket', 'pants') then st.category
          else 'suit'
        end as kind,
        'crystal' = any (st.tags) and not public.crystal_promo_active() as crystal
    ) b
    where st.id = p_style_id and s.id
  ) p
  where p_days >= 1;
$$;
