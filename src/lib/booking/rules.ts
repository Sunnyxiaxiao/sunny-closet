/**
 * Rental period and scheduling rules (pure functions). The database's exclusion constraint implements the same rules:
 *
 * - Customers choose "ski days" (first to last day they'll wear it) and are billed only for those: rental days = last − first + 1
 * - The item is with the customer longer: local pickup is the evening before and return is by noon the next day; shipping goes out days ahead and comes back after.
 *   Those days aren't billed but still reserve inventory, called "lead / tail days" (see settings and fulfillmentPadding)
 * - Occupied range = [first day − lead days, last day + 1 + tail days + cleaning buffer days), half-open
 * - Two occupied ranges of the same inventory item must never overlap
 *
 * Example: skiing Saturday and Sunday with local pickup (lead 1, tail 1) and 1 cleaning day →
 *     pick up Friday evening, return by Monday noon, clean Tuesday; occupied Friday–Tuesday, so the next customer can pick up Wednesday evening at the earliest (skiing Thursday).
 */

import { addDays, compareDates, daysBetween, isIsoDate, type IsoDate } from "@/lib/dates";
import type { BookingStatus } from "@/lib/supabase/database.types";

export interface RentalRange {
  /** First ski day */
  start: IsoDate;
  /** Last ski day */
  end: IsoDate;
}

/** Extra days of inventory occupied around the ski days (not billed) */
export interface Padding {
  /** Before the first day: local pickup the evening before = 1; for shipping, days shipped ahead */
  leadDays: number;
  /** After the last day: local return by noon the next day = 1; for shipping, return shipping + transit days */
  tailDays: number;
}

export const NO_PADDING: Padding = { leadDays: 0, tailDays: 0 };

/** Half-open range [from, toExclusive) */
export interface BlockedInterval {
  from: IsoDate;
  toExclusive: IsoDate;
}

/** Order statuses that still occupy inventory; keep in sync with the database's is_blocking_status() */
export const BLOCKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "picked_up",
  "returned",
];

export function isBlockingStatus(status: BookingStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}

export function rentalDays({ start, end }: RentalRange): number {
  const days = daysBetween(start, end) + 1;
  if (days < 1) throw new Error("最后一天不能早于第一天");
  return days;
}

export function blockedInterval(
  range: RentalRange,
  bufferDays: number,
  padding: Padding = NO_PADDING,
): BlockedInterval {
  for (const [name, value] of [
    ["缓冲天数", bufferDays],
    ["前置天数", padding.leadDays],
    ["后置天数", padding.tailDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name}必须是非负整数`);
  }
  rentalDays(range);
  return {
    from: addDays(range.start, -padding.leadDays),
    toExclusive: addDays(range.end, 1 + padding.tailDays + bufferDays),
  };
}

export function intervalsOverlap(a: BlockedInterval, b: BlockedInterval): boolean {
  return compareDates(a.from, b.toExclusive) < 0 && compareDates(b.from, a.toExclusive) < 0;
}

/** The earliest date this item can be occupied again after this order (including tail days and cleaning) */
export function earliestNextStart(end: IsoDate, bufferDays: number, tailDays = 0): IsoDate {
  return addDays(end, 1 + tailDays + bufferDays);
}

export interface ExistingBooking {
  range: RentalRange;
  /** Buffer days recorded when the order was placed */
  bufferDays: number;
  /** Lead / tail days recorded when the order was placed; older orders don't have them and count as 0 */
  padding?: Padding;
  status: BookingStatus;
}

/** Whether an inventory item is free for the requested ski days (with the padding of the chosen fulfillment method) */
export function isItemFree(
  request: RentalRange,
  bufferDays: number,
  existing: readonly ExistingBooking[],
  padding: Padding = NO_PADDING,
): boolean {
  const wanted = blockedInterval(request, bufferDays, padding);
  return existing.every(
    (booking) =>
      !isBlockingStatus(booking.status) ||
      !intervalsOverlap(wanted, blockedInterval(booking.range, booking.bufferDays, booking.padding)),
  );
}

/** Lead and tail days for local pickup / shipping (from the database settings) */
export interface FulfillmentPaddings {
  pickup: Padding;
  shipping: Padding;
}

/** Shipping goes out early, so the earliest first ski day is "today + shipping lead days" */
export function earliestShippingStart(today: IsoDate, paddings: FulfillmentPaddings): IsoDate {
  return addDays(today, paddings.shipping.leadDays);
}

export type RangeError = "invalid_date" | "end_before_start" | "start_in_past" | "too_long";

/** Validates the customer's rental period; returns null when valid */
export function validateRentalRange(
  range: { start?: string | null; end?: string | null },
  options: { today: IsoDate; maxRentalDays: number },
): RangeError | null {
  if (!isIsoDate(range.start) || !isIsoDate(range.end)) return "invalid_date";
  if (compareDates(range.end, range.start) < 0) return "end_before_start";
  if (compareDates(range.start, options.today) < 0) return "start_in_past";
  if (rentalDays({ start: range.start, end: range.end }) > options.maxRentalDays) return "too_long";
  return null;
}
