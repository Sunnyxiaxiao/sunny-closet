import { describe, expect, it } from "vitest";
import { shop } from "@/config/shop";
import {
  formatShippingAddress,
  isShippingState,
  qualifiesForFreeShipping,
  SHIPPING_STATES,
  shippingFeeCents,
  shippingPolicyArgs,
  showFullLookTip,
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

describe("运费：满 $99 或 full look 包邮，否则按州收", () => {
  const line = (category: string, rentalCents: number, addOnCategories: string[] = [], addOnCents = 0) => ({
    category,
    rentalCents,
    addOnCents,
    addOnCategories,
  });

  it("租金 + 加购满 $99 包邮，什么都算，押金不算", () => {
    expect(qualifiesForFreeShipping([line("suit", 9900)])).toBe(true);
    expect(qualifiesForFreeShipping([line("jacket", 5000), line("pants", 3500)])).toBe(false);
    expect(qualifiesForFreeShipping([line("jacket", 5000), line("pants", 3500), line("gloves", 1800)])).toBe(true);
    expect(qualifiesForFreeShipping([line("jacket", 5000, ["helmet_cover"], 4900)])).toBe(true);
  });

  it("一整套 full look（上衣、裤子、头盔套、手套）不满 $99 也包邮：套装、连体服、混搭，加购或单租都算", () => {
    expect(qualifiesForFreeShipping([line("suit", 7900, ["helmet_cover", "gloves"], 1800)])).toBe(true);
    expect(qualifiesForFreeShipping([line("one_piece", 4900, ["helmet_cover", "gloves"], 1800)])).toBe(true);
    expect(
      qualifiesForFreeShipping([line("jacket", 3500), line("pants", 2500, ["gloves"], 1000), line("helmet_cover", 1500)]),
    ).toBe(true);
    // 差一样都不算
    expect(qualifiesForFreeShipping([line("suit", 7900, ["helmet_cover"], 800)])).toBe(false);
    expect(qualifiesForFreeShipping([line("jacket", 5000, ["helmet_cover", "gloves"], 1800)])).toBe(false);
  });

  it("包邮：近区 0，远区补 $15", () => {
    const free = [line("suit", 7900, ["helmet_cover", "gloves"], 1800)];
    expect(shippingFeeCents(free, "NY")).toBe(0);
    expect(shippingFeeCents(free, "CA")).toBe(1500);
  });

  it("不包邮：东北部等 $15，远区（如 WA、CA）$30；还没选州按近区", () => {
    const gloves = [line("gloves", 2200)];
    expect(shippingFeeCents(gloves, "NY")).toBe(1500);
    expect(shippingFeeCents(gloves, "DC")).toBe(1500);
    expect(shippingFeeCents(gloves, "")).toBe(1500);
    expect(shippingFeeCents(gloves, "WA")).toBe(3000);
    expect(shippingFeeCents(gloves, "CA")).toBe(3000);
  });

  it("full look 小提示：衣服齐了、只差头盔套或手套其中一样，且还没包邮时才显示", () => {
    expect(showFullLookTip([line("suit", 7900, ["helmet_cover"], 800)])).toBe(true);
    expect(showFullLookTip([line("suit", 7900, ["gloves"], 1000)])).toBe(true);
    expect(showFullLookTip([line("suit", 7900)])).toBe(false);
    expect(showFullLookTip([line("jacket", 5000, ["helmet_cover"], 800)])).toBe(false);
    expect(showFullLookTip([line("suit", 9900, ["helmet_cover"], 800)])).toBe(false);
    expect(showFullLookTip([line("suit", 7900, ["helmet_cover", "gloves"], 1800)])).toBe(false);
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
      expect(all).toMatch(/\$30/);
      expect(all).toMatch(/full look/i);
      expect(all).toMatch(locale === "zh" ? /2 天起租/ : /2-day minimum|2 days/);
      expect(all).toMatch(/Ithaca/);
      expect(all).not.toMatch(/全美包邮|free shipping nationwide/i);
    }
  });
});
