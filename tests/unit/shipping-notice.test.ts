import { describe, expect, it } from "vitest";
import { shippingNotice } from "@/lib/booking/rules";
import { rushFeeCents, shippingFeeCents } from "@/lib/shipping";

const paddings = { pickup: { leadDays: 1, tailDays: 0 }, shipping: { leadDays: 3, tailDays: 4 } };
const today = "2026-12-01";

describe("邮寄提前天数", () => {
  it("不到 3 天：寄不到，不能下单", () => {
    expect(shippingNotice("2026-12-03", today, paddings, 7)).toBe("too_soon");
  });

  it("3–6 天：急单（加急或等店主确认）", () => {
    expect(shippingNotice("2026-12-04", today, paddings, 7)).toBe("short");
    expect(shippingNotice("2026-12-07", today, paddings, 7)).toBe("short");
  });

  it("7 天及以上：正常", () => {
    expect(shippingNotice("2026-12-08", today, paddings, 7)).toBe("normal");
  });
});

describe("加急费", () => {
  it("近区 $15、远区 $25", () => {
    expect(rushFeeCents("NY")).toBe(1500);
    expect(rushFeeCents("CA")).toBe(2500);
  });

  it("包邮订单也要另收加急费（运费是 0，加急费照收）", () => {
    const freeLine = [{ category: "suit", rentalCents: 9900, addOnCents: 0, addOnCategories: [] }];
    expect(shippingFeeCents(freeLine, "NY")).toBe(0);
    expect(rushFeeCents("NY")).toBe(1500);
  });
});
