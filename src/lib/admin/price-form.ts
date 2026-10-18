/** 后台“价格”页：表单里每一格是美元（可以带小数），存进数据库前换成美分 */

export const PRICE_TABLES = [
  { key: "suit", column: "rental_prices_cents", label: "完整套装（成套 / 连体服）" },
  { key: "jacket", column: "jacket_prices_cents", label: "只租外套" },
  { key: "pants", column: "pants_prices_cents", label: "只租雪裤" },
] as const;

export type PriceTableKey = (typeof PRICE_TABLES)[number]["key"];

/** "49" → 4900；空、负数、不是数字、超过 $5000 → null */
export function dollarsToCents(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents <= 500_000 ? cents : null;
}

/** 一行价目表：第 n 格 = 租 n 天的总价。有一格不对就返回出错的天数 */
export function parsePriceRow(
  values: string[],
): { ok: true; cents: number[] } | { ok: false; day: number } {
  const cents: number[] = [];
  for (const [i, raw] of values.entries()) {
    const c = dollarsToCents(raw);
    if (c === null) return { ok: false, day: i + 1 };
    cents.push(c);
  }
  return { ok: true, cents };
}

/** 款式自己的价目表（头盔套、手套，或者想给某一套单独定价）："15, 22, 22, 28" → [1500, 2200, 2200, 2800]；空 → null（按品类价目表） */
export function parsePriceList(raw: string): { ok: true; cents: number[] | null } | { ok: false } {
  const parts = raw
    .split(/[,，\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: true, cents: null };
  const row = parsePriceRow(parts);
  return row.ok && parts.length <= 31 ? { ok: true, cents: row.cents } : { ok: false };
}

export const centsToDollars = (cents: number) => String(cents / 100);
