import { describe, expect, it } from "vitest";
import { dollarsToCents, parsePriceList, parsePriceRow } from "@/lib/admin/price-form";

describe("后台价格输入", () => {
  it("美元换成美分，最多两位小数", () => {
    expect(dollarsToCents("49")).toBe(4900);
    expect(dollarsToCents(" 12.5 ")).toBe(1250);
    expect(dollarsToCents("-1")).toBeNull();
    expect(dollarsToCents("1.234")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("6000")).toBeNull();
  });

  it("一行价目表，指出哪一天填错了", () => {
    expect(parsePriceRow(["35", "50", "60"])).toEqual({ ok: true, cents: [3500, 5000, 6000] });
    expect(parsePriceRow(["35", "", "60"])).toEqual({ ok: false, day: 2 });
  });

  it("款式自己的价目表：逗号或空格分隔，留空表示按品类", () => {
    expect(parsePriceList("15, 22，22 28")).toEqual({ ok: true, cents: [1500, 2200, 2200, 2800] });
    expect(parsePriceList("  ")).toEqual({ ok: true, cents: null });
    expect(parsePriceList("15, x")).toEqual({ ok: false });
  });
});
