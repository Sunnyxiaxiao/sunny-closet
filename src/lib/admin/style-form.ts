/** 后台新增 / 编辑雪服、手套用到的选项和默认值（头盔套有自己的表单，见 helmet-cover 相关文件） */

import { STYLE_CATEGORIES } from "@/lib/categories";
import { CRYSTAL_TAG, GLOVES_DEFAULT_PRICES } from "@/lib/gloves";
import type { StyleCategory } from "@/lib/supabase/database.types";

export type AdminStyleKind = "outfit" | "gloves";

// 和 src/lib/catalog.ts 的 BIB_TAG / HOODIE_TAG 一致（catalog.ts 只能在服务端用，表单在浏览器里）
const BIB_TAG = "bib";
const HOODIE_TAG = "hoodie";

export const OUTFIT_CATEGORIES = STYLE_CATEGORIES;

/** 后台表单里能勾选的标签。其他标签（同款系列 series:…、上衣配黑裤 with-black-pants 等）保存时原样保留 */
export const TAG_OPTIONS = [
  { tag: CRYSTAL_TAG, label: "✦ Crystal 系列（带钻：黑色卡片、排在最前面）", categories: [...STYLE_CATEGORIES, "gloves"] },
  { tag: BIB_TAG, label: "背带裤（按“只租外套”价目表收费）", categories: ["pants"] },
  { tag: HOODIE_TAG, label: "卫衣（按“只租雪裤”价目表收费）", categories: ["jacket"] },
] as const satisfies readonly { tag: string; label: string; categories: readonly StyleCategory[] }[];

const MANAGED_TAGS = new Set<string>(TAG_OPTIONS.map((o) => o.tag));

/** 表单勾选的标签 + 原来就有、表单不管的标签；勾选了但不适用于这个品类的不保存 */
export function mergeTags(existing: readonly string[], checked: readonly string[], category: StyleCategory) {
  const allowed = TAG_OPTIONS.filter((o) => (o.categories as readonly string[]).includes(category)).map((o) => o.tag);
  return [
    ...existing.filter((t) => !MANAGED_TAGS.has(t)),
    ...checked.filter((t) => (allowed as readonly string[]).includes(t)),
  ];
}

/** 新增时的默认押金（美元），和商品清单导入脚本一致 */
export function defaultDeposit(category: StyleCategory, tags: readonly string[]) {
  if (category === "gloves") return 0;
  if (category === "pants") return tags.includes(BIB_TAG) ? 150 : 100;
  if (category === "jacket") return tags.includes(HOODIE_TAG) ? 100 : 150;
  return 200;
}

/** daily_price_cents 是旧字段（实际按价目表收费），新增时填一个合理的起租价 */
export function defaultDailyCents(category: StyleCategory, ownPrices: number[] | null) {
  if (ownPrices) return ownPrices[0];
  if (category === "jacket") return 3500;
  if (category === "pants") return 2500;
  return 4900;
}

export const GLOVES_DEFAULT_PRICE_TEXT = GLOVES_DEFAULT_PRICES.map((c) => c / 100).join(", ");

/** 库存编号前缀：雪服 SC001…，手套 GL001… */
export function codePrefix(category: StyleCategory) {
  return category === "gloves" ? "GL" : "SC";
}

/** 英文名 → 网址名，例如 "Pink Bow Ski Suit" → "pink-bow-ski-suit" */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
