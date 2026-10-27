/**
 * Order status transitions (pure functions). Admin buttons only show allowed next steps, and the server validates again.
 *
 * pending → confirmed / rejected / cancelled
 * confirmed → picked up / cancelled
 * picked up → returned
 * returned, rejected and cancelled are final and can't change.
 *
 * Moving from a status that released inventory back to one that occupies it is not allowed, since it could clash with dates someone else has booked since.
 */

import type { BookingStatus } from "@/lib/supabase/database.types";

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

export function nextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
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
