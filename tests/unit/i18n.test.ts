import { describe, expect, it } from "vitest";
import { localePath, splitLocalePath } from "@/i18n/config";
import { handoverText } from "@/lib/booking/schedule";
import { formatDate, formatShortDate } from "@/lib/dates";
import { mapBookingError } from "@/lib/booking/errors";
import { priceTiers } from "@/lib/pricing";
import { createCheckoutSchema, firstFieldErrors } from "@/lib/validation/booking-request";
import { getMessages, sizeLabel } from "@/messages";

const CJK = /[㐀-鿿]/;

/** 把文字表里所有的字符串（含函数返回值）拿出来，带上路径方便定位 */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const result = (value as (...args: unknown[]) => unknown)("X", 2, 3);
    return strings(result, `${path}()`);
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

function keys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [path];
  return Object.entries(value).flatMap(([k, v]) => keys(v, path ? `${path}.${k}` : k));
}

describe("网址里的语言前缀", () => {
  it("中文不带前缀，英文加 /en", () => {
    expect(localePath("zh", "/styles")).toBe("/styles");
    expect(localePath("en", "/styles?size=M")).toBe("/en/styles?size=M");
    expect(localePath("en", "/")).toBe("/en");
  });

  it("从地址栏路径拆出语言", () => {
    expect(splitLocalePath("/en/styles/a")).toEqual({ locale: "en", path: "/styles/a" });
    expect(splitLocalePath("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocalePath("/styles")).toEqual({ locale: "zh", path: "/styles" });
    expect(splitLocalePath("/english")).toEqual({ locale: "zh", path: "/english" });
  });
});

describe("中英文文字表", () => {
  const zh = getMessages("zh");
  const en = getMessages("en");

  it("英文版和中文版的结构一样（每一句中文都有对应的英文）", () => {
    // sizeNames 只有英文需要；admin 只有中文
    const shared = (k: string) => !k.startsWith("sizeNames.") && !k.startsWith("admin.");
    expect(keys(en).filter(shared).sort()).toEqual(keys(zh).filter(shared).sort());
  });

  it("英文版里没有漏翻的中文", () => {
    const leftovers = strings(en).filter(
      ([path, text]) => CJK.test(text) && !path.startsWith("nav.switchLanguage"),
    );
    expect(leftovers).toEqual([]);
  });

  it("英文版没有空字符串（from、suffix 这类可省略的词除外）", () => {
    const empty = strings(en).filter(([path, text]) => text.trim() === "" && !/\.(from|suffix)$/.test(path));
    expect(empty).toEqual([]);
  });
});

describe("按语言格式化", () => {
  it("日期", () => {
    expect(formatShortDate("2026-01-10", "en")).toBe("Jan 10");
    expect(formatDate("2026-01-10", "en")).toBe("Sat, Jan 10, 2026");
    expect(formatShortDate("2026-01-10", "zh")).toBe("1月10日");
  });

  it("价目表档位", () => {
    expect(priceTiers([1500, 2000, 2000, 2500], 7, "en").map((t) => t.label)).toEqual([
      "1 day",
      "2–3 days",
      "4–7 days",
    ]);
  });

  it("取件 / 归还时间", () => {
    const weekend = { start: "2026-01-10", end: "2026-01-11" };
    expect(handoverText(weekend, "pickup", { leadDays: 1, tailDays: 1 }, "en")).toBe(
      "pick up from the evening of Jan 9, return by noon on Jan 12",
    );
    expect(handoverText(weekend, "shipping", { leadDays: 3, tailDays: 4 }, "en")).toBe(
      "ships Jan 7, send back by Jan 12",
    );
  });

  it("尺码 / 颜色名", () => {
    expect(sizeLabel("芭比玫红 · S", "en")).toBe("Barbie Rose · S");
    expect(sizeLabel("均码", "en")).toBe("One size");
    expect(sizeLabel("M", "en")).toBe("M");
    expect(sizeLabel("芭比玫红 · S", "zh")).toBe("芭比玫红 · S");
  });

  it("预订错误和表单校验", () => {
    expect(mapBookingError("ERROR: no_availability", "en")).toMatch(/just booked/);
    const result = createCheckoutSchema(getMessages("en").validation).safeParse({ name: "  ", email: "x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstFieldErrors(result.error).name).toBe("Please enter your name");
  });
});
