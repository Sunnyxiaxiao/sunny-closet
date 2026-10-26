import { describe, expect, it } from "vitest";
import { shop } from "@/config/shop";
import { formatShippingAddress, isShippingState, SHIPPING_STATES, shippingPolicyArgs, ZIP_RE } from "@/lib/shipping";
import { getMessages } from "@/messages";

describe("可邮寄地区", () => {
  it("美国本土 48 州 + DC，共 49 个，不含阿拉斯加、夏威夷", () => {
    expect(SHIPPING_STATES).toHaveLength(49);
    expect(new Set(SHIPPING_STATES.map((s) => s.code)).size).toBe(49);
    expect(isShippingState("DC")).toBe(true);
    expect(isShippingState("NY")).toBe(true);
    expect(isShippingState("AK")).toBe(false);
    expect(isShippingState("HI")).toBe(false);
    expect(isShippingState("PR")).toBe(false);
  });

  it("邮编：5 位或 5+4 位", () => {
    expect(ZIP_RE.test("14850")).toBe(true);
    expect(ZIP_RE.test("14850-1234")).toBe(true);
    for (const zip of ["1485", "148500", "ABCDE", "14850-12"]) expect(ZIP_RE.test(zip)).toBe(false);
  });
});

describe("formatShippingAddress", () => {
  it("拼成一行地址存进订单", () => {
    expect(formatShippingAddress({ street: "1 Main St", city: "Ithaca", state: "NY", zip: "14850" })).toBe(
      "1 Main St, Ithaca, NY 14850",
    );
  });
});

describe("邮寄文案：全美包邮，不再分区收运费", () => {
  it("配置里没有运费", () => {
    expect(Object.keys(shop.shipping)).toEqual(["orderAheadDays"]);
  });

  it("中英文都写明包邮、邮寄 2 天起、自取 1 天起，没有加收运费的说法", () => {
    for (const locale of ["zh", "en"] as const) {
      const m = getMessages(locale);
      const texts = [m.product.shippingPolicy(...shippingPolicyArgs(2)), ...m.rentalInfo.shippingRules(...shippingPolicyArgs(2))];
      const all = texts.join("\n");
      expect(all).toMatch(locale === "zh" ? /全美包邮/ : /free shipping/i);
      expect(all).toMatch(locale === "zh" ? /2 天起租/ : /2-day minimum|2 days/);
      expect(all).toMatch(/Ithaca/);
      expect(all).not.toMatch(/\$9\.99|另收|surcharge|shipping fee/i);
    }
  });
});
