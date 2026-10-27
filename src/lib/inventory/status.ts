/**
 * An inventory item's current status (pure function). Not stored in the database but derived from orders and blocked dates, so it can't drift from the orders:
 *
 * - Unavailable: disabled in admin, or today falls within manually blocked dates
 * - Rented out: has a picked-up order (the item is with the customer)
 * - Returned: the order was returned and the return date hasn't passed (local pickup: the day after the last ski day; shipping: the expected arrival date)
 * - Cleaning: the order was returned and we're within the buffer days after the return date
 * - Booked: today falls between the evening before pickup / ship date and the last ski day of a pending / confirmed order, waiting for pickup or shipping
 * - Available: none of the above
 */

import { addDays, compareDates, type IsoDate } from "@/lib/dates";
import { earliestNextStart, isBlockingStatus } from "@/lib/booking/rules";
import type { BookingStatus, InventoryStatus } from "@/lib/supabase/database.types";

export const ITEM_STATES = ["available", "reserved", "rented", "returned", "cleaning", "unavailable"] as const;

export type ItemState = (typeof ITEM_STATES)[number];

export interface ItemBooking {
  /** First / last ski day */
  start: IsoDate;
  end: IsoDate;
  bufferDays: number;
  /** Days occupied around the ski days (evening before pickup, return day, shipping transit); 0 for older orders */
  leadDays?: number;
  tailDays?: number;
  status: BookingStatus;
}

export interface ItemBlock {
  start: IsoDate;
  end: IsoDate;
}

function covers(range: { start: IsoDate; end: IsoDate }, day: IsoDate) {
  return compareDates(range.start, day) <= 0 && compareDates(day, range.end) <= 0;
}

export function itemState(input: {
  status: InventoryStatus;
  today: IsoDate;
  bookings: readonly ItemBooking[];
  blocks: readonly ItemBlock[];
}): ItemState {
  const { today, bookings } = input;
  if (input.status === "inactive") return "unavailable";
  if (bookings.some((b) => b.status === "picked_up")) return "rented";

  // Return date = last ski day + tail days (local pickup: the next day; shipping: the day the package arrives)
  const backBy = (b: ItemBooking) => addDays(b.end, b.tailDays ?? 0);
  const recentReturn = bookings.find(
    (b) =>
      b.status === "returned" &&
      compareDates(addDays(b.start, -(b.leadDays ?? 0)), today) <= 0 &&
      compareDates(today, earliestNextStart(b.end, b.bufferDays, b.tailDays ?? 0)) < 0,
  );
  if (recentReturn) return compareDates(today, backBy(recentReturn)) <= 0 ? "returned" : "cleaning";

  if (input.blocks.some((block) => covers(block, today))) return "unavailable";
  // From the evening before pickup / ship date through the last ski day counts as "booked" (waiting for pickup or shipping)
  if (
    bookings.some(
      (b) =>
        (b.status === "pending" || b.status === "confirmed") &&
        covers({ start: addDays(b.start, -(b.leadDays ?? 0)), end: b.end }, today),
    )
  ) {
    return "reserved";
  }
  return "available";
}

/** Occupying orders that haven't ended (return date not reached), sorted by first ski day */
export function upcomingBookings<T extends ItemBooking>(bookings: readonly T[], today: IsoDate): T[] {
  return bookings
    .filter(
      (b) =>
        isBlockingStatus(b.status) &&
        b.status !== "returned" &&
        compareDates(addDays(b.end, b.tailDays ?? 0), today) >= 0,
    )
    .sort((a, b) => compareDates(a.start, b.start));
}
