import { describe, expect, it } from "vitest";
import { handover, handoverText } from "@/lib/booking/schedule";

// 周六 1/10、周日 1/11 滑雪
const weekend = { start: "2026-01-10", end: "2026-01-11" };

describe("handover 取件 / 归还时间", () => {
  it("到店自取：周五晚上取，周一中午前还，只收 2 天", () => {
    expect(handover(weekend, { leadDays: 1, tailDays: 1 })).toEqual({ out: "2026-01-09", back: "2026-01-12" });
    expect(handoverText(weekend, "pickup", { leadDays: 1, tailDays: 1 })).toBe(
      "1月9日晚上起可取件，1月12日中午前归还",
    );
  });

  it("邮寄：提前 3 天寄出，次日前寄回", () => {
    expect(handoverText(weekend, "shipping", { leadDays: 3, tailDays: 4 })).toBe("1月7日寄出，请在1月12日前寄回");
  });

  it("旧订单（没有前置 / 后置天数）：取件日就是第一天，归还日就是最后一天", () => {
    expect(handoverText(weekend, "pickup", { leadDays: 0, tailDays: 0 })).toBe("1月10日取件，1月11日归还");
  });
});
