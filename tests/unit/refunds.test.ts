import { describe, expect, it } from "vitest";
import { recordStripeRefund } from "@/lib/payments/refunds";

/** Fake orders table: refund due → refunded when Stripe's refunded total covers it (same conditions as the webhook's update) */
function store(orders: { intent: string; refundStatus: "due" | "refunded" | null; refundCents: number | null }[]) {
  return async (intent: string, refunded: number) => {
    let n = 0;
    for (const o of orders) {
      if (o.intent === intent && o.refundStatus === "due" && o.refundCents !== null && o.refundCents <= refunded) {
        o.refundStatus = "refunded";
        n += 1;
      }
    }
    return n;
  };
}

describe("Stripe 退款回调", () => {
  it("全额退款：待退款变成已退款", async () => {
    const orders = [{ intent: "pi_1", refundStatus: "due" as const, refundCents: 9400 }];
    expect(await recordStripeRefund({ payment_intent: "pi_1", amount_refunded: 9400 }, store(orders))).toBe(1);
    expect(orders[0].refundStatus).toBe("refunded");
  });

  it("只退了一部分：仍是待退款", async () => {
    const orders = [{ intent: "pi_1", refundStatus: "due" as const, refundCents: 9400 }];
    await recordStripeRefund({ payment_intent: "pi_1", amount_refunded: 5000 }, store(orders));
    expect(orders[0].refundStatus).toBe("due");
  });

  it("没有待退款的订单（例如正常订单的部分退款）：什么都不改", async () => {
    const orders = [{ intent: "pi_1", refundStatus: null, refundCents: null }];
    expect(await recordStripeRefund({ payment_intent: { id: "pi_1" }, amount_refunded: 9400 }, store(orders))).toBe(0);
    expect(await recordStripeRefund({ payment_intent: null, amount_refunded: 9400 }, store(orders))).toBe(0);
  });
});
