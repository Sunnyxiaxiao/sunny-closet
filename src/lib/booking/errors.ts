/**
 * Error codes raised by the database function create_booking → messages shown to customers (Chinese / English in messages.bookingErrors).
 * See create_booking in supabase/migrations for the codes.
 */

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

const BOOKING_ERROR_CODES = [
  "invalid_dates",
  "rental_too_long",
  "style_not_found",
  "price_changed",
  "shipping_min_days",
  "no_availability",
  "addon_unavailable",
  "addon_not_found",
  "invalid_addons",
  "shipping_dates_differ",
  "invalid_cart",
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

export const DEFAULT_BOOKING_ERROR = getMessages("zh").bookingErrors.default;

/** The error code in a database error, or null if unrecognized */
export function bookingErrorCode(message: string | null | undefined): BookingErrorCode | null {
  if (!message) return null;
  return BOOKING_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

export function mapBookingError(message: string | null | undefined, locale: Locale = "zh"): string {
  const t = getMessages(locale).bookingErrors;
  const code = bookingErrorCode(message);
  return code ? t[code] : t.default;
}
