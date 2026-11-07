import { describe, expect, it, vi } from "vitest";
import { alertOverdueConflicts, type OverdueConflict } from "@/lib/booking/overdue-alerts";

const conflict = (bookingId: string, alertedAt: string | null = null): OverdueConflict => ({
  lateBookingNo: "SC-LATE",
  itemCode: "A-M",
  holdUntil: "2026-12-27",
  bookingId,
  bookingNo: `SC-${bookingId}`,
  startDate: "2026-12-24",
  alertedAt,
});

describe("逾期件冲突提醒", () => {
  it("每个受影响的订单只提醒一次：已提醒过的不再发", async () => {
    const send = vi.fn(async () => {});
    const markAlerted = vi.fn(async () => {});
    const result = await alertOverdueConflicts({
      list: async () => [conflict("a"), conflict("b", "2026-12-20T10:00:00Z")],
      send,
      markAlerted,
    });
    expect(send).toHaveBeenCalledWith([conflict("a")]);
    expect(markAlerted).toHaveBeenCalledWith(["a"]);
    expect(result).toEqual({ alerted: 1 });
  });

  it("没有新冲突：不发邮件", async () => {
    const send = vi.fn(async () => {});
    expect(await alertOverdueConflicts({ list: async () => [conflict("b", "x")], send, markAlerted: vi.fn() })).toEqual({
      alerted: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("邮件没发出去：不标记，下次再发", async () => {
    const markAlerted = vi.fn(async () => {});
    await expect(
      alertOverdueConflicts({
        list: async () => [conflict("a")],
        send: async () => {
          throw new Error("mail down");
        },
        markAlerted,
      }),
    ).rejects.toThrow("mail down");
    expect(markAlerted).not.toHaveBeenCalled();
  });
});
