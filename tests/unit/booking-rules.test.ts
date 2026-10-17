import { describe, expect, it } from "vitest";
import {
  blockedInterval,
  earliestNextStart,
  intervalsOverlap,
  isItemFree,
  rentalDays,
  validateRentalRange,
  type ExistingBooking,
} from "@/lib/booking/rules";

const booking = (
  start: string,
  end: string,
  bufferDays = 1,
  status: ExistingBooking["status"] = "confirmed",
): ExistingBooking => ({ range: { start, end }, bufferDays, status });

describe("rentalDays（取件日与归还日都算）", () => {
  it("同一天取还算 1 天", () => {
    expect(rentalDays({ start: "2026-01-10", end: "2026-01-10" })).toBe(1);
  });

  it("10 号取 12 号还算 3 天", () => {
    expect(rentalDays({ start: "2026-01-10", end: "2026-01-12" })).toBe(3);
  });

  it("跨月", () => {
    expect(rentalDays({ start: "2026-01-30", end: "2026-02-02" })).toBe(4);
  });

  it("跨闰年 2 月底", () => {
    expect(rentalDays({ start: "2028-02-28", end: "2028-03-01" })).toBe(3);
  });

  it("归还日早于取件日时报错", () => {
    expect(() => rentalDays({ start: "2026-01-10", end: "2026-01-09" })).toThrow();
  });
});

describe("blockedInterval（占用区间含缓冲天数）", () => {
  it("缓冲 1 天：10–12 号租期占用到 13 号（14 号可再取）", () => {
    expect(blockedInterval({ start: "2026-01-10", end: "2026-01-12" }, 1)).toEqual({
      from: "2026-01-10",
      toExclusive: "2026-01-14",
    });
  });

  it("缓冲 0 天：只占用租期本身", () => {
    expect(blockedInterval({ start: "2026-01-10", end: "2026-01-12" }, 0)).toEqual({
      from: "2026-01-10",
      toExclusive: "2026-01-13",
    });
  });

  it("缓冲天数跨月", () => {
    expect(blockedInterval({ start: "2026-01-29", end: "2026-01-31" }, 2)).toEqual({
      from: "2026-01-29",
      toExclusive: "2026-02-03",
    });
  });

  it("拒绝负数或小数缓冲天数", () => {
    expect(() => blockedInterval({ start: "2026-01-10", end: "2026-01-10" }, -1)).toThrow();
    expect(() => blockedInterval({ start: "2026-01-10", end: "2026-01-10" }, 0.5)).toThrow();
  });
});

describe("earliestNextStart", () => {
  it("12 号归还、缓冲 1 天 → 14 号", () => {
    expect(earliestNextStart("2026-01-12", 1)).toBe("2026-01-14");
  });

  it("月底归还、缓冲 1 天 → 下月 2 号", () => {
    expect(earliestNextStart("2026-01-31", 1)).toBe("2026-02-02");
  });

  it("缓冲 0 天 → 归还次日", () => {
    expect(earliestNextStart("2026-01-12", 0)).toBe("2026-01-13");
  });
});

describe("intervalsOverlap", () => {
  const a = { from: "2026-01-10", toExclusive: "2026-01-14" };

  it("首尾相接（右开）不算重叠", () => {
    expect(intervalsOverlap(a, { from: "2026-01-14", toExclusive: "2026-01-16" })).toBe(false);
    expect(intervalsOverlap({ from: "2026-01-08", toExclusive: "2026-01-10" }, a)).toBe(false);
  });

  it("交叉一天即重叠", () => {
    expect(intervalsOverlap(a, { from: "2026-01-13", toExclusive: "2026-01-15" })).toBe(true);
  });

  it("包含关系算重叠", () => {
    expect(intervalsOverlap(a, { from: "2026-01-11", toExclusive: "2026-01-12" })).toBe(true);
    expect(intervalsOverlap({ from: "2026-01-01", toExclusive: "2026-02-01" }, a)).toBe(true);
  });

  it("顺序无关", () => {
    const b = { from: "2026-01-12", toExclusive: "2026-01-20" };
    expect(intervalsOverlap(a, b)).toBe(intervalsOverlap(b, a));
  });
});

describe("isItemFree（重叠检测 + 缓冲天数）", () => {
  const existing = [booking("2026-01-10", "2026-01-12", 1)];

  it("当天归还当天取件：不允许（归还日当天仍算占用）", () => {
    expect(isItemFree({ start: "2026-01-12", end: "2026-01-15" }, 1, existing)).toBe(false);
    expect(
      isItemFree({ start: "2026-01-12", end: "2026-01-15" }, 0, [booking("2026-01-10", "2026-01-12", 0)]),
    ).toBe(false);
  });

  it("缓冲 1 天：归还次日（清洁日）不能取件", () => {
    expect(isItemFree({ start: "2026-01-13", end: "2026-01-15" }, 1, existing)).toBe(false);
  });

  it("缓冲 1 天：归还后第 2 天可以取件", () => {
    expect(isItemFree({ start: "2026-01-14", end: "2026-01-15" }, 1, existing)).toBe(true);
  });

  it("缓冲 0 天：归还次日即可取件", () => {
    expect(
      isItemFree({ start: "2026-01-13", end: "2026-01-13" }, 0, [booking("2026-01-10", "2026-01-12", 0)]),
    ).toBe(true);
  });

  it("新租期在已有租期之前：需给自己留出缓冲天数", () => {
    // 新租期 7–8 号，缓冲 1 天 → 占用到 9 号，10 号已有人取，可以
    expect(isItemFree({ start: "2026-01-07", end: "2026-01-08" }, 1, existing)).toBe(true);
    // 新租期 7–9 号，缓冲 1 天 → 占用到 10 号，与已有租期冲突
    expect(isItemFree({ start: "2026-01-07", end: "2026-01-09" }, 1, existing)).toBe(false);
  });

  it("租期只有一天，落在已有租期中间", () => {
    expect(isItemFree({ start: "2026-01-11", end: "2026-01-11" }, 1, existing)).toBe(false);
  });

  it("租期只有一天，与已有租期隔开足够的缓冲", () => {
    expect(isItemFree({ start: "2026-01-08", end: "2026-01-08" }, 1, existing)).toBe(true);
  });

  it("跨月：1 月底的租期 + 缓冲，影响 2 月初", () => {
    const monthEnd = [booking("2026-01-29", "2026-01-31", 1)];
    expect(isItemFree({ start: "2026-02-01", end: "2026-02-03" }, 1, monthEnd)).toBe(false);
    expect(isItemFree({ start: "2026-02-02", end: "2026-02-03" }, 1, monthEnd)).toBe(true);
  });

  it("跨年", () => {
    const yearEnd = [booking("2026-12-30", "2026-12-31", 1)];
    expect(isItemFree({ start: "2027-01-01", end: "2027-01-02" }, 1, yearEnd)).toBe(false);
    expect(isItemFree({ start: "2027-01-02", end: "2027-01-02" }, 1, yearEnd)).toBe(true);
  });

  it("使用已有订单下单时记录的缓冲天数", () => {
    // 已有订单记录的缓冲是 3 天：12 号还，13–15 号清洁，16 号才可取
    const old = [booking("2026-01-10", "2026-01-12", 3)];
    expect(isItemFree({ start: "2026-01-15", end: "2026-01-15" }, 0, old)).toBe(false);
    expect(isItemFree({ start: "2026-01-16", end: "2026-01-16" }, 0, old)).toBe(true);
  });

  it("已拒绝 / 已取消的订单不占用库存", () => {
    const released = [
      booking("2026-01-10", "2026-01-12", 1, "rejected"),
      booking("2026-01-10", "2026-01-12", 1, "cancelled"),
    ];
    expect(isItemFree({ start: "2026-01-10", end: "2026-01-12" }, 1, released)).toBe(true);
  });

  it("待确认 / 已取件 / 已归还的订单都占用库存", () => {
    for (const status of ["pending", "picked_up", "returned"] as const) {
      expect(
        isItemFree({ start: "2026-01-11", end: "2026-01-11" }, 1, [booking("2026-01-10", "2026-01-12", 1, status)]),
      ).toBe(false);
    }
  });

  it("没有任何订单时空闲", () => {
    expect(isItemFree({ start: "2026-01-10", end: "2026-01-12" }, 1, [])).toBe(true);
  });
});

describe("validateRentalRange", () => {
  const options = { today: "2026-01-10", maxRentalDays: 30 };

  it("合法租期返回 null", () => {
    expect(validateRentalRange({ start: "2026-01-10", end: "2026-01-10" }, options)).toBeNull();
    expect(validateRentalRange({ start: "2026-01-10", end: "2026-02-08" }, options)).toBeNull();
  });

  it("日期缺失或格式错误", () => {
    expect(validateRentalRange({ start: "", end: "2026-01-12" }, options)).toBe("invalid_date");
    expect(validateRentalRange({ start: "2026-02-30", end: "2026-03-01" }, options)).toBe("invalid_date");
    expect(validateRentalRange({}, options)).toBe("invalid_date");
  });

  it("归还日早于取件日", () => {
    expect(validateRentalRange({ start: "2026-01-12", end: "2026-01-11" }, options)).toBe("end_before_start");
  });

  it("取件日在过去", () => {
    expect(validateRentalRange({ start: "2026-01-09", end: "2026-01-12" }, options)).toBe("start_in_past");
  });

  it("超过最长租期", () => {
    expect(validateRentalRange({ start: "2026-01-10", end: "2026-02-09" }, options)).toBe("too_long");
  });
});
