import { describe, expect, it } from "vitest";
import { dueReminders, type ReminderOrder } from "@/lib/booking/reminders";

// Skiing Sat Dec 19 – Sun Dec 20; local pickup from the evening of Fri Dec 18, back by noon Mon Dec 21
const order = (overrides: Partial<ReminderOrder> = {}): ReminderOrder => ({
  status: "confirmed",
  fulfillment: "pickup",
  createdOn: "2026-12-01",
  lines: [{ start: "2026-12-19", end: "2026-12-20", leadDays: 1, tailDays: 1 }],
  logged: [],
  ...overrides,
});

describe("取件提醒", () => {
  it("取件当天早上 9 点后发，之前不发", () => {
    expect(dueReminders(order(), "2026-12-18", 8)).toEqual([]);
    expect(dueReminders(order(), "2026-12-18", 9)).toEqual(["pickup_reminder"]);
  });

  it("只在取件那天发：前一天、后一天都不发", () => {
    expect(dueReminders(order(), "2026-12-17", 12)).toEqual([]);
    expect(dueReminders(order(), "2026-12-19", 12)).toEqual([]);
  });

  it("发过（或记录过）就不再发", () => {
    expect(dueReminders(order({ logged: ["pickup_reminder"] }), "2026-12-18", 12)).toEqual([]);
  });

  it("邮寄订单、没确认或已取件的订单不发", () => {
    expect(dueReminders(order({ fulfillment: "shipping", lines: [{ start: "2026-12-19", end: "2026-12-20", leadDays: 3, tailDays: 4 }] }), "2026-12-16", 12)).toEqual([]);
    expect(dueReminders(order({ status: "pending" }), "2026-12-18", 12)).toEqual([]);
    expect(dueReminders(order({ status: "picked_up" }), "2026-12-18", 12)).toEqual([]);
    expect(dueReminders(order({ status: "cancelled" }), "2026-12-18", 12)).toEqual([]);
  });

  it("取件当天才下的单不发（确认邮件刚说过）", () => {
    expect(dueReminders(order({ createdOn: "2026-12-18" }), "2026-12-18", 15)).toEqual([]);
  });

  it("购物车里日期不同：按最早取件的那件", () => {
    const lines = [
      { start: "2026-12-22", end: "2026-12-23", leadDays: 1, tailDays: 1 },
      { start: "2026-12-19", end: "2026-12-20", leadDays: 1, tailDays: 1 },
    ];
    expect(dueReminders(order({ lines }), "2026-12-18", 12)).toEqual(["pickup_reminder"]);
    expect(dueReminders(order({ lines }), "2026-12-21", 12)).toEqual([]);
  });
});

describe("归还提醒", () => {
  it("最后一个滑雪日发，已取件和（忘了点已取件的）已确认订单都发", () => {
    expect(dueReminders(order({ status: "picked_up" }), "2026-12-20", 9)).toEqual(["return_reminder"]);
    expect(dueReminders(order(), "2026-12-20", 9)).toEqual(["return_reminder"]);
    expect(dueReminders(order({ status: "picked_up" }), "2026-12-20", 8)).toEqual([]);
  });

  it("邮寄订单也发", () => {
    const shipped = order({ fulfillment: "shipping", lines: [{ start: "2026-12-19", end: "2026-12-20", leadDays: 3, tailDays: 4 }] });
    expect(dueReminders(shipped, "2026-12-20", 10)).toEqual(["return_reminder"]);
  });

  it("已归还、已取消、发过的不发；不是最后一天不发", () => {
    expect(dueReminders(order({ status: "returned" }), "2026-12-20", 12)).toEqual([]);
    expect(dueReminders(order({ status: "cancelled" }), "2026-12-20", 12)).toEqual([]);
    expect(dueReminders(order({ status: "picked_up", logged: ["return_reminder"] }), "2026-12-20", 12)).toEqual([]);
    expect(dueReminders(order({ status: "picked_up" }), "2026-12-19", 12)).toEqual([]);
    expect(dueReminders(order({ status: "picked_up" }), "2026-12-21", 12)).toEqual([]);
  });

  it("只租一天、当天取当天滑：两封提醒各发一次", () => {
    const sameDay = order({ lines: [{ start: "2026-12-19", end: "2026-12-19", leadDays: 0, tailDays: 1 }] });
    expect(dueReminders(sameDay, "2026-12-19", 9)).toEqual(["pickup_reminder", "return_reminder"]);
  });
});
