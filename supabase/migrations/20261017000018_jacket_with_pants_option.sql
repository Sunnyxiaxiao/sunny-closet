-- Sunny Closet：只有上衣的款式，可以出一个“上衣 + 随机黑色滑雪裤”的选项
--
-- 做法：组合套装允许只有 1 件单品。套装按套装价目表收费，下单时占用那件上衣的库存，
-- 和单租上衣不会撞单；黑色滑雪裤是店里的基础款，随机配，不单独记库存。
-- 页面上用 'with-black-pants' 标签区分这种套装和店主搭配的多件套装。

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
