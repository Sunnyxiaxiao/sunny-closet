/**
 * The admin cancels an order (pure rules; database, Stripe and the email come in as `deps`, tests: tests/unit/cancel-order.test.ts).
 *
 * An order that was paid is never cancelled without a trace of the money: it's cancelled together with a refund due
 * (the red reminder in admin), and with "full" the payment is then refunded through Stripe and marked refunded.
 * If Stripe doesn't answer or says no, the order stays cancelled with the refund due, so nothing is forgotten.
 * Unpaid orders are just cancelled. The customer gets a cancellation email either way.
 */

import type { BookingStatus, RefundStatus } from "@/lib/supabase/database.types";

/** full = refund the whole payment now; later = cancel and leave the refund to the owner (e.g. a late cancellation, part kept) */
export type CancelRefundMode = "full" | "later";

export interface CancellableOrder {
  id: string;
  status: BookingStatus;
  /** Child orders follow their main order and can't be cancelled on their own */
  isChild: boolean;
  paidCents: number | null;
  /** The checkout payment in Stripe; null for money taken in person and unpaid orders */
  paymentIntentId: string | null;
  refundStatus: RefundStatus | null;
}

export interface CancelDeps {
  /**
   * Cancels the order if it still has this status, with a refund due of `refundDueCents` (0 = none, refund columns untouched).
   * False if someone changed the order in the meantime.
   */
  cancel(bookingId: string, fromStatus: BookingStatus, refundDueCents: number): Promise<boolean>;
  /** Refunds this much of the payment in Stripe; throws if it didn't go through */
  refund(paymentIntentId: string, cents: number, idempotencyKey: string): Promise<void>;
  /** Refund due → refunded */
  markRefunded(bookingId: string): Promise<void>;
  /** After the order is cancelled: `refundCents` is what the payment was, `refunded` whether it already went back */
  onCancelled(bookingId: string, refund: { refundCents: number; refunded: boolean }): void;
}

export interface CancelResult {
  ok: boolean;
  /** For the admin (Chinese, like the rest of the admin) */
  message: string;
}

const CANCELLABLE: readonly BookingStatus[] = ["pending", "confirmed"];

/** What a cancellation owes back: the payment, unless the order already has a refund on record */
export function refundOwedCents(order: Pick<CancellableOrder, "paidCents" | "refundStatus">): number {
  return order.refundStatus === null ? Math.max(order.paidCents ?? 0, 0) : 0;
}

export async function cancelOrder(deps: CancelDeps, order: CancellableOrder, mode: CancelRefundMode): Promise<CancelResult> {
  const stale: CancelResult = { ok: false, message: "这单的状态已经变了，请刷新页面" };
  if (order.isChild || !CANCELLABLE.includes(order.status)) return stale;

  const owed = refundOwedCents(order);
  if (owed === 0) {
    if (!(await deps.cancel(order.id, order.status, 0))) return stale;
    deps.onCancelled(order.id, { refundCents: 0, refunded: false });
    return {
      ok: true,
      message: order.refundStatus ? "订单已取消。这单之前已有退款记录，请到 Stripe 核对还要不要再退" : "订单已取消",
    };
  }

  if (mode === "full" && !order.paymentIntentId) {
    return { ok: false, message: "这单不是在线刷卡付的，不能自动退款，请选“暂不退款”后当面或转账退回" };
  }
  // Cancelled and owed first: whatever happens with Stripe next, the reminder is there
  if (!(await deps.cancel(order.id, order.status, owed))) return stale;

  if (mode === "later") {
    deps.onCancelled(order.id, { refundCents: owed, refunded: false });
    return { ok: true, message: "订单已取消，已标为待退款" };
  }

  try {
    // One key per order: a double click (or a retry) never refunds twice
    await deps.refund(order.paymentIntentId!, owed, `cancel-refund-${order.id}`);
  } catch (error) {
    deps.onCancelled(order.id, { refundCents: owed, refunded: false });
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `订单已取消，但退款没有成功（${reason}）。已标为待退款，请到 Stripe 后台退款` };
  }
  await deps.markRefunded(order.id);
  deps.onCancelled(order.id, { refundCents: owed, refunded: true });
  return { ok: true, message: "订单已取消，已全额退款" };
}
