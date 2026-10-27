/**
 * Price calculation (pure functions). All amounts are in cents to avoid floating-point errors.
 *
 * Current rule: tiered pricing. Rental = the table's total for n days; days beyond the table use the last tier;
 * total = rental + add-ons + deposit. The price table lives in the database at settings.rental_prices_cents,
 * e.g. [4900, 7900, 9400, 10900, 11900, 12900, 13900] means 1 day $49, 2 days $79, 3 days $94 … 7 days $139.
 * Styles can have their own table (styles.rental_prices_cents, e.g. helmet covers [1500, 2000, 2000, 2500]).
 * Add-ons (helmet covers with an outfit) are a flat price for the whole rental, regardless of days.
 * The database's create_booking re-validates with the same rules.
 */

import { rentalDays, type RentalRange } from "@/lib/booking/rules";

export interface PriceInput extends RentalRange {
  /** Price table: item n is the total rental for n days */
  rentalPricesCents: readonly number[];
  depositCents: number;
  /** Flat prices of add-on accessories (once per rental); there can be several */
  addOnPricesCents?: readonly number[];
}

export interface Quote {
  rentalDays: number;
  rentalCents: number;
  /** Average per day (rounded, for records and display only) */
  averageDailyCents: number;
  /** Add-ons total */
  addOnCents: number;
  depositCents: number;
  totalCents: number;
}

function assertCents(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} 必须是非负整数（单位：分）`);
  }
}

/** Total rental for `days` days */
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
  /** E.g. "1 day", "2–3 days", "5–7 days" */
  label: string;
  /** Longest day count in this tier */
  maxDays: number;
  cents: number;
}

/** Turns a price table into display tiers: consecutive days with the same price merge into one tier, e.g. [15, 20, 20, 25] → 1 day / 2–3 days / 4–7 days */
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
