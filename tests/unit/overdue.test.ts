import { describe, expect, it } from "vitest";
import { overdueInfo } from "@/lib/booking/overdue";

// Same cases as tests/db/overdue-hold.test.ts: the admin display must agree with what the database holds
const TODAY = "2026-12-20";
const base = { status: "picked_up", end_date: "2026-12-10", tail_days: 0, buffer_days: 1, expected_return_date: null };

describe("逾期未还：后台显示", () => {
  it("没取件、或者还在租期内：不算逾期", () => {
    expect(overdueInfo({ ...base, status: "confirmed" }, TODAY, 7)).toBeNull();
    expect(overdueInfo({ ...base, end_date: "2026-12-21" }, TODAY, 7)).toBeNull();
  });

  it("归还当天：还不算逾期", () => {
    expect(overdueInfo({ ...base, end_date: "2026-12-19" }, TODAY, 7)).toBeNull();
  });

  it("逾期：天数从归还日的次日算起，占到今天 + N 天", () => {
    expect(overdueInfo(base, TODAY, 7)).toEqual({ lateDays: 9, holdUntil: "2026-12-27", byExpectedReturn: false });
    expect(overdueInfo({ ...base, end_date: "2026-12-18" }, TODAY, 3)).toEqual({
      lateDays: 1,
      holdUntil: "2026-12-23",
      byExpectedReturn: false,
    });
  });

  it("邮寄：归还日要加上寄回的天数", () => {
    expect(overdueInfo({ ...base, end_date: "2026-12-17", tail_days: 2 }, TODAY, 7)).toBeNull();
    expect(overdueInfo({ ...base, end_date: "2026-12-16", tail_days: 2 }, TODAY, 7)?.lateDays).toBe(1);
  });

  it("填了预计归还日：占到那天 + 清洁日；过了那天回到顺延", () => {
    expect(overdueInfo({ ...base, expected_return_date: "2026-12-30" }, TODAY, 7)).toEqual({
      lateDays: 9,
      holdUntil: "2026-12-31",
      byExpectedReturn: true,
    });
    expect(overdueInfo({ ...base, expected_return_date: "2026-12-19" }, TODAY, 7)).toMatchObject({
      holdUntil: "2026-12-27",
      byExpectedReturn: false,
    });
  });

  it("还没逾期就填了更晚的预计归还日：也显示占用到那天", () => {
    expect(overdueInfo({ ...base, end_date: "2026-12-25", expected_return_date: "2027-01-02" }, TODAY, 7)).toEqual({
      lateDays: 0,
      holdUntil: "2027-01-03",
      byExpectedReturn: true,
    });
  });
});
