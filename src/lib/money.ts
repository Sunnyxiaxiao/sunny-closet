import { shop } from "@/config/shop";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: shop.currency,
});

const wholeFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: shop.currency,
  maximumFractionDigits: 0,
});

/** 2800 → "$28.00"；加 whole 时整数美元不带小数：4900 → "$49" */
export function formatMoney(cents: number, options: { whole?: boolean } = {}): string {
  if (options.whole && cents % 100 === 0) return wholeFormatter.format(cents / 100);
  return formatter.format(cents / 100);
}
