import { describe, expect, it } from "vitest";
import { cancelOrder, refundOwedCents, type CancelDeps, type CancellableOrder } from "@/lib/payments/cancel-order";

const paid: CancellableOrder = {
  id: "b1",
  status: "confirmed",
  isChild: false,
  paidCents: 8900,
  paymentIntentId: "pi_1",
  refundStatus: null,
};

/** Fake database and Stripe: records what happened to the order */
function world(order: CancellableOrder, { stripeFails = false, changedMeanwhile = false } = {}) {
  const log = {
    status: order.status as string,
    refundStatus: order.refundStatus as string | null,
    refundCents: null as number | null,
    refunds: [] as { intent: string; cents: number; key: string }[],
    emails: [] as { refundCents: number; refunded: boolean }[],
  };
  const deps: CancelDeps = {
    async cancel(_id, fromStatus, refundDueCents) {
      if (changedMeanwhile || log.status !== fromStatus) return false;
      log.status = "cancelled";
      if (refundDueCents > 0) {
        log.refundStatus = "due";
        log.refundCents = refundDueCents;
      }
      return true;
    },
    async refund(intent, cents, key) {
      if (stripeFails) throw new Error("card network down");
      log.refunds.push({ intent, cents, key });
    },
    async markRefunded() {
      if (log.refundStatus === "due") log.refundStatus = "refunded";
    },
    onCancelled: (_id, refund) => void log.emails.push(refund),
  };
  return { deps, log };
}

describe("后台取消订单", () => {
  it("已付款、全额退款：取消，通过 Stripe 退回全部已付金额，标为已退款，邮件写明退款", async () => {
    const { deps, log } = world(paid);
    const result = await cancelOrder(deps, paid, "full");
    expect(result.ok).toBe(true);
    expect(log).toMatchObject({ status: "cancelled", refundStatus: "refunded", refundCents: 8900 });
    expect(log.refunds).toEqual([{ intent: "pi_1", cents: 8900, key: "cancel-refund-b1" }]);
    expect(log.emails).toEqual([{ refundCents: 8900, refunded: true }]);
  });

  it("已付款、暂不退款：取消并挂待退款，不动 Stripe", async () => {
    const { deps, log } = world(paid);
    const result = await cancelOrder(deps, paid, "later");
    expect(result.ok).toBe(true);
    expect(log).toMatchObject({ status: "cancelled", refundStatus: "due", refundCents: 8900 });
    expect(log.refunds).toEqual([]);
    expect(log.emails).toEqual([{ refundCents: 8900, refunded: false }]);
  });

  it("Stripe 退款失败：订单仍然取消，留着待退款提醒，并告诉店主", async () => {
    const { deps, log } = world(paid, { stripeFails: true });
    const result = await cancelOrder(deps, paid, "full");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("card network down");
    expect(log).toMatchObject({ status: "cancelled", refundStatus: "due", refundCents: 8900 });
    expect(log.emails).toEqual([{ refundCents: 8900, refunded: false }]);
  });

  it("没付款的订单：直接取消，没有退款记录", async () => {
    const unpaid = { ...paid, status: "pending" as const, paidCents: null, paymentIntentId: null };
    const { deps, log } = world(unpaid);
    expect((await cancelOrder(deps, unpaid, "later")).ok).toBe(true);
    expect(log).toMatchObject({ status: "cancelled", refundStatus: null, refundCents: null });
    expect(log.emails).toEqual([{ refundCents: 0, refunded: false }]);
  });

  it("当面收的钱不能自动退：选全额退款时不取消，提示改选暂不退款", async () => {
    const cash = { ...paid, paymentIntentId: null };
    const { deps, log } = world(cash);
    expect((await cancelOrder(deps, cash, "full")).ok).toBe(false);
    expect(log.status).toBe("confirmed");
    expect((await cancelOrder(deps, cash, "later")).ok).toBe(true);
    expect(log).toMatchObject({ status: "cancelled", refundStatus: "due", refundCents: 8900 });
  });

  it("已取件、已归还、已取消的订单和子订单不能取消", async () => {
    for (const order of [
      { ...paid, status: "picked_up" as const },
      { ...paid, status: "returned" as const },
      { ...paid, status: "cancelled" as const },
      { ...paid, isChild: true },
    ]) {
      const { deps, log } = world(order);
      expect((await cancelOrder(deps, order, "full")).ok).toBe(false);
      expect(log.refunds).toEqual([]);
      expect(log.emails).toEqual([]);
    }
  });

  it("页面过期（别人已经改了状态）：不退款、不发邮件", async () => {
    const { deps, log } = world(paid, { changedMeanwhile: true });
    expect((await cancelOrder(deps, paid, "full")).ok).toBe(false);
    expect(log.refunds).toEqual([]);
    expect(log.emails).toEqual([]);
  });

  it("已有退款记录的订单（比如重复付款待退）：只取消，不覆盖原来的记录", async () => {
    const withRefund = { ...paid, refundStatus: "due" as const };
    expect(refundOwedCents(withRefund)).toBe(0);
    const { deps, log } = world(withRefund);
    const result = await cancelOrder(deps, withRefund, "full");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Stripe");
    expect(log).toMatchObject({ status: "cancelled", refundStatus: "due", refundCents: null });
    expect(log.refunds).toEqual([]);
  });
});
