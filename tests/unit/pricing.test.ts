import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";
import { calculateQuote } from "@/lib/pricing";

describe("calculateQuote", () => {
  const base = { dailyPriceCents: 2800, depositCents: 15000 };

  it("租期只有一天", () => {
    expect(calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-10" })).toEqual({
      rentalDays: 1,
      dailyPriceCents: 2800,
      rentalCents: 2800,
      depositCents: 15000,
      totalCents: 17800,
    });
  });

  it("10 号取 12 号还：3 天 × 日租价 + 押金", () => {
    const quote = calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-12" });
    expect(quote.rentalDays).toBe(3);
    expect(quote.rentalCents).toBe(8400);
    expect(quote.totalCents).toBe(23400);
  });

  it("跨月", () => {
    const quote = calculateQuote({ ...base, start: "2026-01-30", end: "2026-02-02" });
    expect(quote.rentalDays).toBe(4);
    expect(quote.rentalCents).toBe(11200);
  });

  it("跨年", () => {
    const quote = calculateQuote({ ...base, start: "2026-12-31", end: "2027-01-01" });
    expect(quote.rentalDays).toBe(2);
    expect(quote.totalCents).toBe(2 * 2800 + 15000);
  });

  it("押金为 0 时合计等于租金", () => {
    const quote = calculateQuote({ dailyPriceCents: 1200, depositCents: 0, start: "2026-01-10", end: "2026-01-11" });
    expect(quote.totalCents).toBe(2400);
  });

  it("金额不是非负整数时报错", () => {
    expect(() =>
      calculateQuote({ dailyPriceCents: 12.5, depositCents: 0, start: "2026-01-10", end: "2026-01-10" }),
    ).toThrow();
    expect(() =>
      calculateQuote({ dailyPriceCents: 1000, depositCents: -1, start: "2026-01-10", end: "2026-01-10" }),
    ).toThrow();
  });

  it("归还日早于取件日时报错", () => {
    expect(() => calculateQuote({ ...base, start: "2026-01-10", end: "2026-01-09" })).toThrow();
  });
});

describe("formatMoney", () => {
  it("美分格式化为美元", () => {
    expect(formatMoney(2800)).toBe("$28.00");
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
  });
});
