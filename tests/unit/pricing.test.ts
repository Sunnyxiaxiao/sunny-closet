import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";
import { calculateQuote, dailyStepCents, priceTiers, rentalPriceCents, summarizeTiers } from "@/lib/pricing";

// 1 天 $49、2 天 $79、3 天 $99、4 天 $119、5 天及以上 $149
const PRICES = [4900, 7900, 9900, 11900, 14900];
const base = { rentalPricesCents: PRICES, depositCents: 20000 };

describe("rentalPriceCents 阶梯价", () => {
  it("每一档对应的价格", () => {
    expect([1, 2, 3, 4, 5].map((d) => rentalPriceCents(PRICES, d))).toEqual(PRICES);
  });

  it("超出价目表的天数沿用最后一档（5–7 天都是 $149）", () => {
    expect(rentalPriceCents(PRICES, 6)).toBe(14900);
    expect(rentalPriceCents(PRICES, 7)).toBe(14900);
  });

  it("天数或价目表不合法时报错", () => {
    expect(() => rentalPriceCents(PRICES, 0)).toThrow();
    expect(() => rentalPriceCents(PRICES, 1.5)).toThrow();
    expect(() => rentalPriceCents([], 1)).toThrow();
    expect(() => rentalPriceCents([4900.5], 1)).toThrow();
    expect(() => rentalPriceCents([-1], 1)).toThrow();
  });
});

describe("calculateQuote", () => {
  it("租期只有一天：$49 + 押金", () => {
    expect(calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-10" })).toEqual({
      rentalDays: 1,
      rentalCents: 4900,
      averageDailyCents: 4900,
      addOnCents: 0,
      depositCents: 20000,
      totalCents: 24900,
    });
  });

  it("10 号取 12 号还：3 天 $99", () => {
    const quote = calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-12" });
    expect(quote.rentalDays).toBe(3);
    expect(quote.rentalCents).toBe(9900);
    expect(quote.averageDailyCents).toBe(3300);
    expect(quote.totalCents).toBe(29900);
  });

  it("跨月、跨年", () => {
    expect(calculateQuote({ ...base, start: "2026-01-30", end: "2026-02-02" }).rentalCents).toBe(11900);
    expect(calculateQuote({ ...base, start: "2026-12-31", end: "2027-01-01" }).rentalCents).toBe(7900);
  });

  it("7 天仍是 $149", () => {
    const quote = calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-16" });
    expect(quote.rentalDays).toBe(7);
    expect(quote.rentalCents).toBe(14900);
  });

  it("押金为 0 时合计等于租金", () => {
    const quote = calculateQuote({ rentalPricesCents: PRICES, depositCents: 0, start: "2026-01-10", end: "2026-01-11" });
    expect(quote.totalCents).toBe(7900);
  });

  it("押金不是非负整数时报错", () => {
    expect(() => calculateQuote({ ...base, depositCents: -1, start: "2026-01-10", end: "2026-01-10" })).toThrow();
    expect(() => calculateQuote({ ...base, depositCents: 1.5, start: "2026-01-10", end: "2026-01-10" })).toThrow();
  });

  it("归还日早于取件日时报错", () => {
    expect(() => calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-09" })).toThrow();
  });
});

describe("头盔套", () => {
  const HELMET = [1500, 2000, 2000, 2500];
  const helmet = { rentalPricesCents: HELMET, depositCents: 0 };

  it("单租：1 天 $15、2–3 天 $20、4–7 天 $25，不按天数相乘", () => {
    const totals = ["2026-01-10", "2026-01-11", "2026-01-12", "2026-01-13", "2026-01-16"].map(
      (end) => calculateQuote({ ...helmet, start: "2026-01-10", end }).totalCents,
    );
    expect(totals).toEqual([1500, 2000, 2000, 2500, 2500]);
  });

  it("搭配雪服：3 天雪服 $99 + 经典款 $8 = $107（再加押金）", () => {
    const quote = calculateQuote({
      ...base,
      start: "2026-01-10",
      end: "2026-01-12",
      addOnPricesCents: [800],
    });
    expect(quote.rentalCents + quote.addOnCents).toBe(10700);
    expect(quote.totalCents).toBe(10700 + 20000);
  });

  it("2 天雪服 $79 + 头盔套 $8 = $87；加购价不随天数变化", () => {
    const twoDays = calculateQuote({ ...base, depositCents: 0, start: "2026-01-10", end: "2026-01-11", addOnPricesCents: [800] });
    expect(twoDays.totalCents).toBe(8700);
    const sevenDays = calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-16", addOnPricesCents: [1200] });
    expect(sevenDays.addOnCents).toBe(1200);
  });

  it("加购价不是非负整数时报错", () => {
    expect(() => calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-10", addOnPricesCents: [-800] })).toThrow();
  });
});

describe("priceTiers 展示用档位", () => {
  it("最长租期 7 天：最后一档显示为 5–7 天", () => {
    expect(priceTiers(PRICES, 7)).toEqual([
      { label: "1 天", maxDays: 1, cents: 4900 },
      { label: "2 天", maxDays: 2, cents: 7900 },
      { label: "3 天", maxDays: 3, cents: 9900 },
      { label: "4 天", maxDays: 4, cents: 11900 },
      { label: "5–7 天", maxDays: 7, cents: 14900 },
    ]);
  });

  it("最长租期正好等于价目表长度时，最后一档是单独的天数", () => {
    expect(priceTiers(PRICES, 5).at(-1)).toEqual({ label: "5 天", maxDays: 5, cents: 14900 });
  });

  it("头盔套价目表：价格相同的天数合并成 2–3 天、4–7 天", () => {
    expect(priceTiers([1500, 2000, 2000, 2500], 7)).toEqual([
      { label: "1 天", maxDays: 1, cents: 1500 },
      { label: "2–3 天", maxDays: 3, cents: 2000 },
      { label: "4–7 天", maxDays: 7, cents: 2500 },
    ]);
  });

  it("最长租期短于价目表时只列到最长租期", () => {
    expect(priceTiers(PRICES, 3)).toHaveLength(3);
  });
});

describe("长租期的价格说明", () => {
  // 套装：前 3 天 49 / 79 / 99，之后每天 +10，一直到 30 天
  const SUIT_30 = [4900, 7900, ...Array.from({ length: 28 }, (_, i) => 9900 + i * 1000)];

  it("档位不超过 10 个时全部列出", () => {
    const tiers = priceTiers(SUIT_30, 10);
    expect(summarizeTiers(tiers)).toEqual({ shown: tiers, longer: null });
  });

  it("30 天每天加价一样：列前 10 档，其余合成一句", () => {
    const { shown, longer } = summarizeTiers(priceTiers(SUIT_30, 30));
    expect(shown).toHaveLength(10);
    expect(shown.at(-1)).toMatchObject({ maxDays: 10, cents: 16900 });
    expect(longer).toEqual({ fromDays: 11, toDays: 30, stepCents: 1000 });
  });

  it("后面各天加价不一样时不给出每天加价", () => {
    const uneven = [...SUIT_30.slice(0, 20), ...Array.from({ length: 10 }, (_, i) => 30000 + i * 500)];
    expect(summarizeTiers(priceTiers(uneven, 30)).longer).toEqual({ fromDays: 11, toDays: 30, stepCents: null });
  });

  it("头盔套这类封顶的价目表：最后一档自动并到最长租期，不需要说明", () => {
    const tiers = priceTiers([1500, 2000, 2000, 2500], 30);
    expect(tiers.at(-1)).toEqual({ label: "4–30 天", maxDays: 30, cents: 2500 });
    expect(summarizeTiers(tiers).longer).toBeNull();
  });

  it("dailyStepCents：每天固定加价、封顶不加价、加价不一致", () => {
    expect(dailyStepCents(SUIT_30, 10, 30)).toBe(1000);
    expect(dailyStepCents([3500, 5000, 6000], 10, 30)).toBe(0);
    expect(dailyStepCents([1000, 2000, 2500, 4000], 2, 4)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("美分格式化为美元", () => {
    expect(formatMoney(2800)).toBe("$28.00");
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("whole 选项：整数美元不带小数，非整数仍保留", () => {
    expect(formatMoney(4900, { whole: true })).toBe("$49");
    expect(formatMoney(4950, { whole: true })).toBe("$49.50");
  });
});
