/**
 * 库存件“现在是什么状态”（纯函数）。不单独存数据库，由订单和手动锁定推算出来，不会和订单对不上：
 *
 * - 不可租：后台停用了这件，或今天在手动锁定的日期里
 * - 已出租：有一笔“已取件”的订单（东西在顾客手上）
 * - 已归还：订单已归还，还没过归还日（到店自取是最后一个滑雪日的次日；邮寄是预计寄到的日子）
 * - 清洁中：订单已归还，在归还日之后的缓冲天数里
 * - 已预订：今天在一笔待确认 / 已确认订单的“取件前一晚 / 寄出日 ～ 最后一个滑雪日”里，等顾客取件或等寄出
 * - 可租：以上都不是
 */

import { addDays, compareDates, type IsoDate } from "@/lib/dates";
import { earliestNextStart, isBlockingStatus } from "@/lib/booking/rules";
import type { BookingStatus, InventoryStatus } from "@/lib/supabase/database.types";

export const ITEM_STATES = ["available", "reserved", "rented", "returned", "cleaning", "unavailable"] as const;

export type ItemState = (typeof ITEM_STATES)[number];

export interface ItemBooking {
  /** 第一个 / 最后一个滑雪日 */
  start: IsoDate;
  end: IsoDate;
  bufferDays: number;
  /** 滑雪日前后占用的天数（取件前一晚、归还日、邮寄运输）；旧订单为 0 */
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

  // 归还日 = 最后一个滑雪日 + 后置天数（到店自取是次日；邮寄是包裹寄到的日子）
  const backBy = (b: ItemBooking) => addDays(b.end, b.tailDays ?? 0);
  const recentReturn = bookings.find(
    (b) =>
      b.status === "returned" &&
      compareDates(addDays(b.start, -(b.leadDays ?? 0)), today) <= 0 &&
      compareDates(today, earliestNextStart(b.end, b.bufferDays, b.tailDays ?? 0)) < 0,
  );
  if (recentReturn) return compareDates(today, backBy(recentReturn)) <= 0 ? "returned" : "cleaning";

  if (input.blocks.some((block) => covers(block, today))) return "unavailable";
  // 从取件前一晚 / 寄出日起，到最后一个滑雪日，都算“已预订”（等待取件或寄出）
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

/** 还没结束的占用订单（还没到归还日），按第一个滑雪日排序 */
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
