import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  daysBetween,
  formatDateZh,
  isIsoDate,
  todayIn,
} from "@/lib/dates";

describe("isIsoDate", () => {
  it("接受真实存在的日期", () => {
    expect(isIsoDate("2026-01-31")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("拒绝不存在的日期和错误格式", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("2026-01-05T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate(20260105)).toBe(false);
  });
});

describe("addDays / daysBetween", () => {
  it("跨月", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
  });

  it("跨年", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("闰年 2 月", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("夏令时切换日不会差一天", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("负数天数", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-01-05", "2026-01-01")).toBe(-4);
  });
});

describe("compareDates", () => {
  it("按日期先后比较", () => {
    expect(compareDates("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareDates("2026-01-02", "2026-01-02")).toBe(0);
    expect(compareDates("2026-12-01", "2026-02-01")).toBe(1);
  });
});

describe("todayIn", () => {
  it("按店铺时区计算今天，而不是服务器时区", () => {
    // UTC 1 月 2 日凌晨 3 点 = 纽约 1 月 1 日晚上 10 点
    const now = new Date("2026-01-02T03:00:00Z");
    expect(todayIn("America/New_York", now)).toBe("2026-01-01");
    expect(todayIn("UTC", now)).toBe("2026-01-02");
    expect(todayIn("Asia/Shanghai", now)).toBe("2026-01-02");
  });
});

describe("formatDateZh", () => {
  it("中文日期带星期", () => {
    expect(formatDateZh("2026-01-10")).toBe("2026年1月10日（周六）");
  });
});
