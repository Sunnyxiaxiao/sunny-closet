/**
 * 数据库函数 create_booking 抛出的错误码 → 给顾客看的提示（中文 / 英文见 messages.bookingErrors）。
 * 错误码见 supabase/migrations 里的 create_booking。
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
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

export const DEFAULT_BOOKING_ERROR = getMessages("zh").bookingErrors.default;

/** 数据库报错里带的错误码；认不出来时返回 null */
export function bookingErrorCode(message: string | null | undefined): BookingErrorCode | null {
  if (!message) return null;
  return BOOKING_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

export function mapBookingError(message: string | null | undefined, locale: Locale = "zh"): string {
  const t = getMessages(locale).bookingErrors;
  const code = bookingErrorCode(message);
  return code ? t[code] : t.default;
}
