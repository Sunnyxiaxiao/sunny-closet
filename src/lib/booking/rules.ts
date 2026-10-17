/**
 * 租期与排期规则（纯函数）。数据库中的排他约束实现的是同一套规则：
 *
 * - 租期天数 = 归还日 − 取件日 + 1（取件日与归还日都算在内，同一天取还算 1 天）
 * - 占用区间 = [取件日, 归还日 + 1 + 缓冲天数)，左闭右开
 * - 同一件库存的两个占用区间不得重叠
 *
 * 例：10 号取、12 号还、缓冲 1 天 → 占用 10–13 号，最早 14 号可再被取走。
 */

import { addDays, compareDates, daysBetween, isIsoDate, type IsoDate } from "@/lib/dates";
import type { BookingStatus } from "@/lib/supabase/database.types";

export interface RentalRange {
  /** 取件日 */
  start: IsoDate;
  /** 归还日 */
  end: IsoDate;
}

/** 左闭右开区间 [from, toExclusive) */
export interface BlockedInterval {
  from: IsoDate;
  toExclusive: IsoDate;
}

/** 仍占用库存的订单状态，与数据库 is_blocking_status() 保持一致 */
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
  if (days < 1) throw new Error("归还日不能早于取件日");
  return days;
}

export function blockedInterval(range: RentalRange, bufferDays: number): BlockedInterval {
  if (!Number.isInteger(bufferDays) || bufferDays < 0) {
    throw new Error("缓冲天数必须是非负整数");
  }
  rentalDays(range);
  return { from: range.start, toExclusive: addDays(range.end, 1 + bufferDays) };
}

export function intervalsOverlap(a: BlockedInterval, b: BlockedInterval): boolean {
  return compareDates(a.from, b.toExclusive) < 0 && compareDates(b.from, a.toExclusive) < 0;
}

/** 归还后，这件库存最早可以再次被取走的日期 */
export function earliestNextStart(end: IsoDate, bufferDays: number): IsoDate {
  return addDays(end, 1 + bufferDays);
}

export interface ExistingBooking {
  range: RentalRange;
  /** 下单时记录的缓冲天数 */
  bufferDays: number;
  status: BookingStatus;
}

/** 某件库存在请求的租期内是否空闲 */
export function isItemFree(
  request: RentalRange,
  bufferDays: number,
  existing: readonly ExistingBooking[],
): boolean {
  const wanted = blockedInterval(request, bufferDays);
  return existing.every(
    (booking) =>
      !isBlockingStatus(booking.status) ||
      !intervalsOverlap(wanted, blockedInterval(booking.range, booking.bufferDays)),
  );
}

export type RangeError = "invalid_date" | "end_before_start" | "start_in_past" | "too_long";

/** 校验顾客选择的租期，合法时返回 null */
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
