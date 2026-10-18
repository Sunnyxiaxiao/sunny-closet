/**
 * 价格计算（纯函数）。金额单位统一为“分”（美分），避免小数误差。
 *
 * 当前规则：阶梯定价。租金 = 价目表里“租 n 天”对应的总价，超出价目表长度的天数用最后一档；
 * 合计 = 租金 + 加购 + 押金。价目表存放在数据库 settings.rental_prices_cents，
 * 例如 [4900, 7900, 9400, 10900, 11900, 12900, 13900] 表示 1 天 $49、2 天 $79、3 天 $94……7 天 $139。
 * 款式可以有自己的价目表（styles.rental_prices_cents，例如头盔套 [1500, 2000, 2000, 2500]）。
 * 加购（搭配雪服的头盔套）是整个租期的固定价，不随天数变化。
 * 数据库的 create_booking 用同一规则再校验一遍。
 */

import { rentalDays, type RentalRange } from "@/lib/booking/rules";

export interface PriceInput extends RentalRange {
  /** 价目表：第 n 项是租 n 天的总租金 */
  rentalPricesCents: readonly number[];
  depositCents: number;
  /** 加购配件的固定价（整个租期一次性），可以有多件 */
  addOnPricesCents?: readonly number[];
}

export interface Quote {
  rentalDays: number;
  rentalCents: number;
  /** 平均每天多少钱（四舍五入，仅用于记录和展示） */
  averageDailyCents: number;
  /** 加购配件合计 */
  addOnCents: number;
  depositCents: number;
  totalCents: number;
}

function assertCents(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} 必须是非负整数（单位：分）`);
  }
}

/** 租 days 天的总租金 */
export function rentalPriceCents(prices: readonly number[], days: number): number {
  if (prices.length === 0) throw new Error("价目表不能为空");
  if (!Number.isInteger(days) || days < 1) throw new Error("租期天数必须是正整数");
  prices.forEach((price, index) => assertCents(`rentalPricesCents[${index}]`, price));
  return prices[Math.min(days, prices.length) - 1];
}

export function calculateQuote(input: PriceInput): Quote {
  assertCents("depositCents", input.depositCents);
  const addOns = input.addOnPricesCents ?? [];
  addOns.forEach((price, index) => assertCents(`addOnPricesCents[${index}]`, price));

  const days = rentalDays(input);
  const rentalCents = rentalPriceCents(input.rentalPricesCents, days);
  const addOnCents = addOns.reduce((sum, price) => sum + price, 0);

  return {
    rentalDays: days,
    rentalCents,
    averageDailyCents: Math.round(rentalCents / days),
    addOnCents,
    depositCents: input.depositCents,
    totalCents: rentalCents + addOnCents + input.depositCents,
  };
}

export interface PriceTier {
  /** 例如 “1 天”“2–3 天”“5–7 天” */
  label: string;
  /** 这一档的最长天数 */
  maxDays: number;
  cents: number;
}

/** 把价目表整理成展示用的档位列表：价格相同的连续天数合并成一档，例如 [15, 20, 20, 25] → 1 天 / 2–3 天 / 4–7 天 */
export function priceTiers(prices: readonly number[], maxRentalDays: number, locale: "zh" | "en" = "zh"): PriceTier[] {
  const tiers: { from: number; to: number; cents: number }[] = [];
  for (let day = 1; day <= maxRentalDays; day += 1) {
    const cents = rentalPriceCents(prices, day);
    const last = tiers.at(-1);
    if (last && last.cents === cents) last.to = day;
    else tiers.push({ from: day, to: day, cents });
  }
  return tiers.map(({ from, to, cents }) => ({
    label:
      locale === "en"
        ? from === to
          ? `${from} ${from === 1 ? "day" : "days"}`
          : `${from}–${to} days`
        : from === to
          ? `${from} 天`
          : `${from}–${to} 天`,
    maxDays: to,
    cents,
  }));
}
