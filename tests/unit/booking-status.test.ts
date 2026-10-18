import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_ERROR, mapBookingError } from "@/lib/booking/errors";
import {
  ADMIN_FILTERS,
  BOOKING_STATUSES,
  canTransition,
  isBookingStatus,
  matchesAdminFilter,
  nextStatuses,
  parseAdminFilter,
} from "@/lib/booking/status";

describe("订单状态流转", () => {
  it("待确认可以 确认 / 拒绝 / 取消", () => {
    expect(nextStatuses("pending")).toEqual(["confirmed", "rejected", "cancelled"]);
  });

  it("正常流程：待确认 → 已确认 → 已取件 → 已归还", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "picked_up")).toBe(true);
    expect(canTransition("picked_up", "returned")).toBe(true);
  });

  it("不能跳步", () => {
    expect(canTransition("pending", "picked_up")).toBe(false);
    expect(canTransition("pending", "returned")).toBe(false);
    expect(canTransition("confirmed", "returned")).toBe(false);
  });

  it("已取件之后不能再取消", () => {
    expect(canTransition("picked_up", "cancelled")).toBe(false);
  });

  it("已归还、已拒绝、已取消是终点", () => {
    for (const status of ["returned", "rejected", "cancelled"] as const) {
      expect(nextStatuses(status)).toEqual([]);
    }
  });

  it("没有任何状态可以回到待确认", () => {
    for (const status of BOOKING_STATUSES) {
      expect(canTransition(status, "pending")).toBe(false);
    }
  });

  it("已释放库存的订单不能改回占用库存的状态", () => {
    for (const released of ["rejected", "cancelled"] as const) {
      for (const status of BOOKING_STATUSES) {
        expect(canTransition(released, status)).toBe(false);
      }
    }
  });

  it("不能转到自己", () => {
    for (const status of BOOKING_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("isBookingStatus 只认合法状态", () => {
    expect(isBookingStatus("confirmed")).toBe(true);
    expect(isBookingStatus("done")).toBe(false);
    expect(isBookingStatus(undefined)).toBe(false);
    expect(isBookingStatus(null)).toBe(false);
  });
});

describe("后台订单分类", () => {
  it("没有参数或参数不认识时默认看待确认", () => {
    expect(parseAdminFilter(undefined)).toBe("pending");
    expect(parseAdminFilter("whatever")).toBe("pending");
  });

  it("认识合法的分类，数组取第一个", () => {
    expect(parseAdminFilter("all")).toBe("all");
    expect(parseAdminFilter(["closed", "pending"])).toBe("closed");
  });

  it("“已关闭”包含已拒绝和已取消，“全部”包含所有状态", () => {
    expect(matchesAdminFilter("rejected", "closed")).toBe(true);
    expect(matchesAdminFilter("cancelled", "closed")).toBe(true);
    expect(matchesAdminFilter("confirmed", "closed")).toBe(false);
    for (const status of BOOKING_STATUSES) {
      expect(matchesAdminFilter(status, "all")).toBe(true);
    }
  });

  it("每个状态恰好属于一个具体分类", () => {
    const specific = ADMIN_FILTERS.filter((f) => f.key !== "all");
    for (const status of BOOKING_STATUSES) {
      const hits = specific.filter((f) => matchesAdminFilter(status, f.key));
      expect(hits).toHaveLength(1);
    }
  });
});

describe("mapBookingError", () => {
  it("数据库错误码对应中文提示", () => {
    expect(mapBookingError("no_availability")).toContain("被订走");
    expect(mapBookingError("price_changed")).toContain("价格");
    expect(mapBookingError("rental_too_long")).toContain("最长");
    expect(mapBookingError("style_not_found")).toContain("下架");
    expect(mapBookingError("invalid_dates")).toContain("日期");
    expect(mapBookingError("shipping_min_days")).toContain("邮寄");
  });

  it("错误码被包在更长的信息里也能识别", () => {
    expect(mapBookingError("error: no_availability (P0001)")).toBe(mapBookingError("no_availability"));
  });

  it("不认识的错误统一显示默认提示，不泄露内部信息", () => {
    expect(mapBookingError("connection refused to db.internal:5432")).toBe(DEFAULT_BOOKING_ERROR);
    expect(mapBookingError(undefined)).toBe(DEFAULT_BOOKING_ERROR);
    expect(mapBookingError(null)).toBe(DEFAULT_BOOKING_ERROR);
  });
});
