import { describe, expect, it } from "vitest";
import { shop } from "@/config/shop";
import {
  formatShippingAddress,
  isShippingState,
  qualifiesForFreeShipping,
  SHIPPING_STATES,
  shippingFeeCents,
  shippingPolicyArgs,
  ZIP_RE,
} from "@/lib/shipping";
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

describe("运费：一套租满 2 天或满 $99 包邮，否则按州收", () => {
  const set = (days: number, rental: number) => ({ category: "suit", rentalDays: days, rentalCents: rental, addOnCents: 0 });
  const gloves = (rental: number) => ({ category: "gloves", rentalDays: 2, rentalCents: rental, addOnCents: 0 });

  it("一套套装或连体服租满 2 天就包邮", () => {
    expect(qualifiesForFreeShipping([set(2, 8900)])).toBe(true);
    expect(qualifiesForFreeShipping([{ ...set(2, 8900), category: "one_piece" }])).toBe(true);
    expect(shippingFeeCents([set(2, 8900)], "CA")).toBe(0);
  });

  it("没有整套时：租金 + 加购满 $99 包邮，押金不算", () => {
    const jacket = { category: "jacket", rentalDays: 2, rentalCents: 5000, addOnCents: 0 };
    const pants = { category: "pants", rentalDays: 2, rentalCents: 3500, addOnCents: 0 };
    expect(qualifiesForFreeShipping([jacket, pants])).toBe(false);
    expect(qualifiesForFreeShipping([jacket, pants, { ...gloves(1400) }])).toBe(true);
    expect(qualifiesForFreeShipping([{ ...jacket, addOnCents: 4900 }])).toBe(true);
  });

  it("不包邮时：东北部等 $15，远区（如 WA、CA）$25", () => {
    expect(shippingFeeCents([gloves(2200)], "NY")).toBe(1500);
    expect(shippingFeeCents([gloves(2200)], "DC")).toBe(1500);
    expect(shippingFeeCents([gloves(2200)], "WA")).toBe(2500);
    expect(shippingFeeCents([gloves(2200)], "CA")).toBe(2500);
  });

  it("远区州都在可邮寄地区里", () => {
    for (const state of shop.shipping.farStates) expect(isShippingState(state)).toBe(true);
  });
});

describe("邮寄文案", () => {
  it("中英文都写明包邮条件、两档运费、邮寄 2 天起、自取 1 天起", () => {
    for (const locale of ["zh", "en"] as const) {
      const m = getMessages(locale);
      const texts = [m.product.shippingPolicy(...shippingPolicyArgs(2)), ...m.rentalInfo.shippingRules(...shippingPolicyArgs(2))];
      const all = texts.join("\n");
      expect(all).toMatch(/\$99/);
      expect(all).toMatch(/\$15/);
      expect(all).toMatch(/\$25/);
      expect(all).toMatch(locale === "zh" ? /2 天起租/ : /2-day minimum|2 days/);
      expect(all).toMatch(/Ithaca/);
      expect(all).not.toMatch(/全美包邮|free shipping nationwide/i);
    }
  });
});
