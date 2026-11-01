import { describe, expect, it } from "vitest";
import { cardLabel, parseDollarsToCents } from "@/lib/booking/card-payment";

describe("刷卡付款", () => {
  it("卡的显示名", () => {
    expect(cardLabel("visa", "4242")).toBe("Visa •••• 4242");
    expect(cardLabel("amex", "0005")).toBe("Amex •••• 0005");
  });

  it("后台输入的扣款金额", () => {
    expect(parseDollarsToCents("25")).toBe(2500);
    expect(parseDollarsToCents(" 25.5 ")).toBe(2550);
    expect(parseDollarsToCents("0.07")).toBe(7);
    for (const bad of ["", "0", "-5", "25.555", "abc", "1e3", "$25"]) expect(parseDollarsToCents(bad)).toBeNull();
  });
});
