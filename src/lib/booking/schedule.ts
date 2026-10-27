/**
 * Pickup / return timing text (pure functions). Only ski days are billed; pickup, return and transit time around them is free:
 * - Local pickup: available from the evening before the first ski day, returned by noon the day after the last ski day
 * - Shipping: sent early enough to arrive before the first ski day; hand the package to the carrier by the day after the last ski day
 */

import type { FulfillmentMethod } from "@/config/shop";
import type { Padding, RentalRange } from "@/lib/booking/rules";
import { addDays, formatShortDate } from "@/lib/dates";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

export interface Handover {
  /** Local pickup: earliest pickup date (evening); shipping: ship date */
  out: string;
  /** Local pickup: return deadline (noon); shipping: ship-back deadline */
  back: string;
}

export function handover(range: RentalRange, padding: Padding): Handover {
  return {
    out: addDays(range.start, -padding.leadDays),
    // Older orders have no tail days, so the return date is the last day
    back: padding.tailDays > 0 ? addDays(range.end, 1) : range.end,
  };
}

/** E.g. "Pick up from the evening of Dec 19, return by noon Dec 23" / "Ships Dec 17, please send back by Dec 23" (same in Chinese) */
export function handoverText(
  range: RentalRange,
  method: FulfillmentMethod,
  padding: Padding,
  locale: Locale = "zh",
): string {
  const t = getMessages(locale).handover;
  const { out, back } = handover(range, padding);
  const date = (d: string) => formatShortDate(d, locale);
  if (method === "shipping") return t.shipping(date(out), date(back));
  const pickup = padding.leadDays > 0 ? t.pickupFromEvening(date(out)) : t.pickupOn(date(out));
  const ret = padding.tailDays > 0 ? t.returnByNoon(date(back)) : t.returnOn(date(back));
  return `${pickup}${t.join}${ret}`;
}
