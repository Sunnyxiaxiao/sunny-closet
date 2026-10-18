import { describe, expect, it } from "vitest";
import { itemState, upcomingBookings, type ItemBooking } from "@/lib/inventory/status";

const today = "2026-01-10";
const booking = (start: string, end: string, status: ItemBooking["status"]): ItemBooking => ({
  start,
  end,
  bufferDays: 1,
  status,
});

function state(bookings: ItemBooking[] = [], options: { inactive?: boolean; blocks?: { start: string; end: string }[] } = {}) {
  return itemState({
    status: options.inactive ? "inactive" : "available",
    today,
    bookings,
    blocks: options.blocks ?? [],
  });
}

describe("itemState 库存件当前状态", () => {
  it("没有订单：可租", () => {
    expect(state()).toBe("available");
  });

  it("后台停用：不可租", () => {
    expect(state([], { inactive: true })).toBe("unavailable");
  });

  it("今天在手动锁定的日期里：不可租；锁定在以后：可租", () => {
    expect(state([], { blocks: [{ start: "2026-01-09", end: "2026-01-10" }] })).toBe("unavailable");
    expect(state([], { blocks: [{ start: "2026-01-11", end: "2026-01-12" }] })).toBe("available");
  });

  it("今天在待确认 / 已确认订单的租期里：已预订", () => {
    expect(state([booking("2026-01-10", "2026-01-12", "confirmed")])).toBe("reserved");
    expect(state([booking("2026-01-08", "2026-01-10", "pending")])).toBe("reserved");
  });

  it("只有以后的订单：现在仍可租", () => {
    expect(state([booking("2026-01-15", "2026-01-16", "confirmed")])).toBe("available");
  });

  it("已取件：已出租（即使超过了归还日）", () => {
    expect(state([booking("2026-01-01", "2026-01-05", "picked_up")])).toBe("rented");
  });

  it("提前归还、还没到归还日：已归还", () => {
    expect(state([booking("2026-01-08", "2026-01-12", "returned")])).toBe("returned");
  });

  it("归还日之后的缓冲天数里：清洁中；过了缓冲期：可租", () => {
    expect(state([booking("2026-01-07", "2026-01-09", "returned")])).toBe("cleaning");
    expect(state([booking("2026-01-06", "2026-01-08", "returned")])).toBe("available");
  });

  it("已取消 / 已拒绝的订单不影响状态", () => {
    expect(state([booking("2026-01-10", "2026-01-12", "cancelled"), booking("2026-01-09", "2026-01-11", "rejected")])).toBe(
      "available",
    );
  });
});

describe("itemState：只按滑雪日计费后的取件前一晚 / 归还日", () => {
  const pickup = (start: string, end: string, status: ItemBooking["status"]): ItemBooking => ({
    ...booking(start, end, status),
    leadDays: 1,
    tailDays: 1,
  });

  it("明天开始滑雪、今晚可取件：已预订", () => {
    expect(state([pickup("2026-01-11", "2026-01-12", "confirmed")])).toBe("reserved");
  });

  it("昨天是最后一个滑雪日、今天中午前归还，已归还：已归还；明天清洁中", () => {
    expect(state([pickup("2026-01-08", "2026-01-09", "returned")])).toBe("returned");
    expect(itemState({ status: "available", today: "2026-01-11", bookings: [pickup("2026-01-08", "2026-01-09", "returned")], blocks: [] })).toBe(
      "cleaning",
    );
  });

  it("邮寄提前 3 天寄出：寄出日起就是已预订", () => {
    const shipped = { ...booking("2026-01-13", "2026-01-14", "confirmed"), leadDays: 3, tailDays: 4 };
    expect(state([shipped])).toBe("reserved");
  });
});

describe("upcomingBookings 即将到来的预订", () => {
  it("只列今天及以后、仍占用库存的订单，按取件日排序", () => {
    const list = upcomingBookings(
      [
        booking("2026-01-20", "2026-01-21", "pending"),
        booking("2026-01-01", "2026-01-03", "confirmed"),
        booking("2026-01-09", "2026-01-11", "picked_up"),
        booking("2026-01-12", "2026-01-13", "cancelled"),
        booking("2026-01-14", "2026-01-15", "confirmed"),
      ],
      today,
    );
    expect(list.map((b) => b.start)).toEqual(["2026-01-09", "2026-01-14", "2026-01-20"]);
  });
});
