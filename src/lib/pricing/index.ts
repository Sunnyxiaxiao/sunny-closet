/**
 * 价格计算（纯函数）。以后要加周末价、整周优惠等规则，只需修改本文件，
 * 页面展示与下单都会自动使用新规则。金额单位统一为“分”（美分），避免小数误差。
 *
 * 当前规则：租金 = 租期天数 × 日租价；合计 = 租金 + 押金。
 */

import { rentalDays, type RentalRange } from "@/lib/booking/rules";

export interface PriceInput extends RentalRange {
  dailyPriceCents: number;
  depositCents: number;
}

export interface Quote {
  rentalDays: number;
  dailyPriceCents: number;
  rentalCents: number;
  depositCents: number;
  totalCents: number;
}

function assertCents(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} 必须是非负整数（单位：分）`);
  }
}

export function calculateQuote(input: PriceInput): Quote {
  assertCents("dailyPriceCents", input.dailyPriceCents);
  assertCents("depositCents", input.depositCents);

  const days = rentalDays(input);
  const rentalCents = days * input.dailyPriceCents;

  return {
    rentalDays: days,
    dailyPriceCents: input.dailyPriceCents,
    rentalCents,
    depositCents: input.depositCents,
    totalCents: rentalCents + input.depositCents,
  };
}
