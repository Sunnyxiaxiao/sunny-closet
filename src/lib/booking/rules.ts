/**
 * 租期与排期规则（纯函数）。数据库中的排他约束实现的是同一套规则：
 *
 * - 顾客选的是“滑雪日”（第一个到最后一个要穿的日子），只按这几天计费：租期天数 = 最后一天 − 第一天 + 1
 * - 东西在顾客手上的时间更长：到店自取前一晚取、次日中午前还；邮寄提前几天寄出、用完再寄回。
 *   这些天不收费，但库存要占住，叫“前置天数 / 后置天数”（见 settings 和 fulfillmentPadding）
 * - 占用区间 = [第一天 − 前置天数, 最后一天 + 1 + 后置天数 + 清洁缓冲天数)，左闭右开
 * - 同一件库存的两个占用区间不得重叠
 *
 * 例：周六、周日滑雪，到店自取（前置 1、后置 1），清洁 1 天 →
 *     周五晚取件，周一中午前归还，周二清洁，占用周五–周二，下一位最早周三晚上取件（周四滑雪）。
 */

import { addDays, compareDates, daysBetween, isIsoDate, type IsoDate } from "@/lib/dates";
import type { BookingStatus } from "@/lib/supabase/database.types";

export interface RentalRange {
  /** 第一个滑雪日 */
  start: IsoDate;
  /** 最后一个滑雪日 */
  end: IsoDate;
}

/** 滑雪日前后额外占用库存的天数（不收费） */
export interface Padding {
  /** 第一天之前：到店自取前一晚取件 = 1；邮寄提前寄出的天数 */
  leadDays: number;
  /** 最后一天之后：到店自取次日中午前归还 = 1；邮寄寄回 + 路上的天数 */
  tailDays: number;
}

export const NO_PADDING: Padding = { leadDays: 0, tailDays: 0 };

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

/** 这笔订单结束后（含后置天数和清洁），这件库存最早可以再次被占用的日期 */
export function earliestNextStart(end: IsoDate, bufferDays: number, tailDays = 0): IsoDate {
  return addDays(end, 1 + tailDays + bufferDays);
}

export interface ExistingBooking {
  range: RentalRange;
  /** 下单时记录的缓冲天数 */
  bufferDays: number;
  /** 下单时记录的前置 / 后置天数；旧订单没有，按 0 算 */
  padding?: Padding;
  status: BookingStatus;
}

/** 某件库存在请求的滑雪日（按 padding 对应的取件方式）内是否空闲 */
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

/** 到店自取 / 邮寄各自的前置、后置天数（数据库 settings 里的设置） */
export interface FulfillmentPaddings {
  pickup: Padding;
  shipping: Padding;
}

/** 邮寄要提前寄出，所以第一个滑雪日最早只能选“今天 + 邮寄前置天数” */
export function earliestShippingStart(today: IsoDate, paddings: FulfillmentPaddings): IsoDate {
  return addDays(today, paddings.shipping.leadDays);
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
