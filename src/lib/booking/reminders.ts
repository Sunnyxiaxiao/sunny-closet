/**
 * Reminder emails to customers (pure rules; the scheduled sweep sends them, see order-notifications.ts):
 *   - pickup_reminder: local pickup orders, on the day the pieces can be picked up (the evening before the first ski day);
 *   - return_reminder: on the last ski day, when and how to bring / send everything back.
 * Each goes out once per order, from REMINDER_HOUR shop time on, and only on that day (a late sweep never sends a stale one).
 */

import type { FulfillmentMethod } from "@/config/shop";
import { handover } from "@/lib/booking/schedule";
import type { IsoDate } from "@/lib/dates";
import type { BookingStatus } from "@/lib/supabase/database.types";

export const REMINDER_KINDS = ["pickup_reminder", "return_reminder"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Earliest hour of the day (shop time zone) a reminder is sent */
export const REMINDER_HOUR = 9;

export interface ReminderOrder {
  status: BookingStatus;
  fulfillment: FulfillmentMethod;
  /** The day the order was placed, in the shop's time zone */
  createdOn: IsoDate;
  /** Every item's ski days and handover days (cart items can have different dates) */
  lines: readonly { start: IsoDate; end: IsoDate; leadDays: number; tailDays: number }[];
  /** Reminders already logged for this order (sent or not: a failed one is retried by the email log, not sent anew) */
  logged: readonly ReminderKind[];
}

/** The reminders this order should get now */
export function dueReminders(order: ReminderOrder, today: IsoDate, hour: number): ReminderKind[] {
  if (hour < REMINDER_HOUR || order.lines.length === 0) return [];
  const due: ReminderKind[] = [];

  // Pickup day: the first item's (an order placed that same day was just told everything in its confirmation)
  const firstOut = order.lines.map((l) => handover(l, l).out).sort()[0];
  if (
    order.fulfillment === "pickup" &&
    order.status === "confirmed" &&
    firstOut === today &&
    order.createdOn < today &&
    !order.logged.includes("pickup_reminder")
  ) {
    due.push("pickup_reminder");
  }

  // Last ski day of the whole order. "confirmed" counts too: the owner may not have marked the order picked up
  const lastEnd = order.lines.map((l) => l.end).sort().at(-1);
  if (
    (order.status === "confirmed" || order.status === "picked_up") &&
    lastEnd === today &&
    !order.logged.includes("return_reminder")
  ) {
    due.push("return_reminder");
  }
  return due;
}
