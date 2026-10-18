/**
 * 手套的规则与常量。手套在数据库里是 category = 'gloves' 的款式，
 * 库存、排期、防超订与雪服共用同一套表和函数；按款式自己的价目表计价，不参与雪服加购。
 */

import type { StyleCategory } from "@/lib/supabase/database.types";

export const GLOVES_CATEGORY = "gloves" as const satisfies StyleCategory;

/** 普通手套的默认价目表（美分）：1 天 $10、2 天 $18、3 天及以上 $25 封顶 */
export const GLOVES_DEFAULT_PRICES = [1000, 1800, 2500];

/** 带这个标签的手套属于 Crystal Collection（限量水钻款），单独成区展示，价目表各自填写 */
export const CRYSTAL_TAG = "crystal";

export function isCrystal(style: { tags: readonly string[] }) {
  return style.tags.includes(CRYSTAL_TAG);
}

/** 从第几天起封顶：价目表最后一档第一次出现的天数，例如 [1000, 1800, 2500] → 3 */
export function capFromDays(prices: readonly number[]) {
  return prices.indexOf(prices[prices.length - 1]) + 1;
}

/**
 * 库存件的 size 写成「颜色 · 尺码」，例如「芭比玫红 · S」。
 * 每个选项对应的图片序号来自 styles.variant_images，没有对应图片的选项不换图。
 */
export function variantImageIndex(
  variantImages: Record<string, number>,
  imageCount: number,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(variantImages).filter(
      ([, index]) => Number.isInteger(index) && index >= 0 && index < imageCount,
    ),
  );
}
