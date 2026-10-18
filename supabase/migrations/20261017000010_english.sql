-- Sunny Closet：英文版
--
-- 商品的英文名称和介绍。网站英文页面优先显示这两列，没填时退回中文。
-- 尺码 / 颜色名（库存 size）仍存中文，英文页面按 src/messages/en.ts 的 sizeNames 翻译。

alter table public.styles
  add column name_en text not null default '' check (char_length(name_en) <= 120),
  add column description_en text not null default '' check (char_length(description_en) <= 6000);
