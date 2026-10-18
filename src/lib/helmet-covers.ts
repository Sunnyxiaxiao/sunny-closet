/**
 * 头盔套（装饰配件）的规则与常量。头盔套在数据库里是 category = 'helmet_cover' 的款式，
 * 库存、排期、防超订与雪服共用同一套表和函数。
 */

import type { HelmetCoverTier, StyleCategory } from "@/lib/supabase/database.types";
import { rentalPriceCents } from "@/lib/pricing";

export const HELMET_COVER_CATEGORY = "helmet_cover" as const satisfies StyleCategory;

/** 头盔套不分尺码，库存件统一用这个尺码 */
export const HELMET_COVER_SIZE = "均码";

export const HELMET_COVER_TIERS = ["regular", "premium"] as const satisfies readonly HelmetCoverTier[];

export function isHelmetCoverTier(value: unknown): value is HelmetCoverTier {
  return typeof value === "string" && (HELMET_COVER_TIERS as readonly string[]).includes(value);
}

/** 新增头盔套时的默认价格（美分），后台可以逐个修改 */
export const HELMET_COVER_DEFAULTS = {
  standalone: { oneDay: 1500, twoToThreeDays: 2000, fourToSevenDays: 2500 },
  addOnCents: { regular: 800, premium: 1200 } satisfies Record<HelmetCoverTier, number>,
};

/** 一套雪服最多加购几件配件。数据结构支持多件，先限制为 1 件 */
export const MAX_ADD_ONS_PER_OUTFIT = 1;

export interface StandalonePrices {
  oneDay: number;
  twoToThreeDays: number;
  fourToSevenDays: number;
}

/** 单租三档价 → 价目表数组（第 n 项 = 租 n 天），4 天及以上沿用最后一项 */
export function standalonePriceTable(prices: StandalonePrices): number[] {
  return [prices.oneDay, prices.twoToThreeDays, prices.twoToThreeDays, prices.fourToSevenDays];
}

/** 价目表数组 → 单租三档价（后台表单回填用） */
export function standalonePricesFrom(table: readonly number[]): StandalonePrices {
  return {
    oneDay: rentalPriceCents(table, 1),
    twoToThreeDays: rentalPriceCents(table, 2),
    fourToSevenDays: rentalPriceCents(table, 4),
  };
}

/** 筛选用的标签分组。标签存英文小写，界面显示中文（见 messages.helmet.tags），不在列表里的标签原样显示 */
export const HELMET_TAG_GROUPS = {
  color: ["pink", "white", "black", "blue", "purple", "red", "yellow", "green", "brown", "colorful"],
  style: ["bunny", "bear", "cat", "dog", "devil", "fluffy", "cute", "funny", "statement"],
} as const;

export type HelmetTagGroup = keyof typeof HELMET_TAG_GROUPS;

const HELMET_COLOR_TAGS = new Set<string>(HELMET_TAG_GROUPS.color);

/**
 * 这顶头盔套的颜色，按标签在商品上的顺序。
 * 约定：image_urls[0] 是系列主图，后面每张图按这个顺序对应一个颜色；
 * 库存件的尺码字段就写成这个颜色的中文名（例如「绿色」），一件一个颜色。
 */
export function helmetColorTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => HELMET_COLOR_TAGS.has(tag));
}

/** 后台录入的标签统一成小写、去空格、去重 */
export function normalizeTags(raw: string): string[] {
  const tags = raw
    .split(/[,，\s]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => /^[\p{L}\p{N}-]{1,20}$/u.test(tag));
  return [...new Set(tags)].slice(0, 20);
}

/** 雪服页“Complete the Look”里一顶可加购的头盔套（传给浏览器端组件，只含展示需要的字段） */
export interface AddOnOption {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | undefined;
  tier: HelmetCoverTier;
  addOnCents: number;
}
