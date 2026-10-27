-- Sunny Closet: English version
--
-- English product names and descriptions. English pages show these columns first and fall back to Chinese when empty.
-- Size / color names (inventory size) stay in Chinese; English pages translate them via sizeNames in src/messages/en.ts.

alter table public.styles
  add column name_en text not null default '' check (char_length(name_en) <= 120),
  add column description_en text not null default '' check (char_length(description_en) <= 6000);
