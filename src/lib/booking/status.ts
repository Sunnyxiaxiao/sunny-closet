/**
 * Order status transitions (pure functions). Admin buttons only show allowed next steps, and the server validates again.
 *
 * pending → confirmed / rejected / cancelled
 * confirmed → picked up / cancelled
 * picked up → returned
 * returned, rejected and cancelled are final and can't change.
 *
 * Moving from a status that released inventory back to one that occupies it is not allowed, since it could clash with dates someone else has booked since.
 *
 * Orders waiting on Stripe (payment_method 'card' / 'in_person_card') confirm themselves once the customer pays or saves a card,
 * so the admin can't confirm them by hand (that would hold the dates and email a confirmation for an unpaid order); they can still be rejected or cancelled.
 */

import type { BookingStatus, PaymentMethod } from "@/lib/supabase/database.types";

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "picked_up",
  "returned",
  "cancelled",
] as const satisfies readonly BookingStatus[];

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["picked_up", "cancelled"],
  picked_up: ["returned"],
  returned: [],
  rejected: [],
  cancelled: [],
};

const CONFIRMED_BY_STRIPE: readonly PaymentMethod[] = ["card", "in_person_card"];

export function nextStatuses(from: BookingStatus, paymentMethod: PaymentMethod | null = null): readonly BookingStatus[] {
  const waitsOnStripe = paymentMethod !== null && CONFIRMED_BY_STRIPE.includes(paymentMethod);
  return waitsOnStripe ? TRANSITIONS[from].filter((to) => to !== "confirmed") : TRANSITIONS[from];
}

export function canTransition(from: BookingStatus, to: BookingStatus, paymentMethod: PaymentMethod | null = null): boolean {
  return nextStatuses(from, paymentMethod).includes(to);
}

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

/** Filter tabs in the admin order list */
export const ADMIN_FILTERS = [
  { key: "pending", statuses: ["pending"] },
  { key: "confirmed", statuses: ["confirmed"] },
  { key: "picked_up", statuses: ["picked_up"] },
  { key: "returned", statuses: ["returned"] },
  { key: "closed", statuses: ["rejected", "cancelled"] },
  { key: "all", statuses: null },
] as const satisfies ReadonlyArray<{ key: string; statuses: readonly BookingStatus[] | null }>;

export type AdminFilterKey = (typeof ADMIN_FILTERS)[number]["key"];

export const DEFAULT_ADMIN_FILTER: AdminFilterKey = "pending";

export function parseAdminFilter(value: string | string[] | undefined): AdminFilterKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return ADMIN_FILTERS.find((f) => f.key === raw)?.key ?? DEFAULT_ADMIN_FILTER;
}

export function matchesAdminFilter(status: BookingStatus, filter: AdminFilterKey): boolean {
  const statuses: readonly BookingStatus[] | null =
    ADMIN_FILTERS.find((f) => f.key === filter)?.statuses ?? null;
  return statuses === null || statuses.includes(status);
}
