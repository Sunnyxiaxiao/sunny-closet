import { shop } from "@/config/shop";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: shop.currency,
});

/** 2800 → "$28.00" */
export function formatMoney(cents: number): string {
  return formatter.format(cents / 100);
}
