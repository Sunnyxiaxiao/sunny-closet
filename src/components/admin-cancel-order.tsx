"use client";

import { useActionState, useState } from "react";
import { cancelBooking } from "@/app/admin/actions";
import type { CancelOrderState } from "@/lib/admin/cancel-order-state";
import { formatMoney } from "@/lib/money";

const OUTLINE = "h-10 rounded-full border border-red-300 px-5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50";

/**
 * 订单卡片里的“取消订单”：
 * 没收过钱的订单 —— 点一下直接取消；
 * 收过钱的订单 —— 先选这笔钱怎么办：马上通过 Stripe 全额退回，或者先取消、挂“待退款”之后自己处理（比如要扣一部分）。
 * 两种情况顾客都会收到取消邮件
 */
export function AdminCancelOrder({
  bookingId,
  label,
  owedCents,
  canRefundOnline,
}: {
  bookingId: string;
  label: string;
  /** 取消后要退回的钱（已付金额）；0 = 没收过钱，或这单已有退款记录 */
  owedCents: number;
  /** 这笔钱是在线刷卡付的，可以通过 Stripe 直接退 */
  canRefundOnline: boolean;
}) {
  const [state, action, pending] = useActionState<CancelOrderState, FormData>(cancelBooking, {});
  const [open, setOpen] = useState(false);

  if (owedCents === 0) {
    return (
      <form action={action}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="refund" value="later" />
        <button type="submit" disabled={pending} className={OUTLINE}>
          {label}
        </button>
        {state.message && !state.ok && <p className="mt-2 text-xs text-red-700">{state.message}</p>}
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={OUTLINE}>
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="basis-full bg-red-50 p-3 text-sm text-red-950">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="font-semibold">这单已收款 {formatMoney(owedCents)}，取消后这笔钱怎么处理？</p>
      <p className="mt-1">
        {canRefundOnline
          ? "全额退款会马上通过 Stripe 退回顾客的卡（付款时的手续费 Stripe 不退还）。要扣一部分的话选“暂不退款”，之后到 Stripe 后台退相应金额。"
          : "这笔钱是当面收的，不能自动退。取消后会标为待退款，请当面或转账退回。"}
        顾客会收到取消邮件。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canRefundOnline && (
          <button
            type="submit"
            name="refund"
            value="full"
            disabled={pending}
            className="h-10 rounded-full bg-red-700 px-5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
          >
            取消并全额退款 {formatMoney(owedCents)}
          </button>
        )}
        <button type="submit" name="refund" value="later" disabled={pending} className={`${OUTLINE} bg-white`}>
          取消，暂不退款
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="h-10 rounded-full px-4 text-sm font-bold text-neutral-700 hover:bg-white disabled:opacity-50"
        >
          先不取消
        </button>
      </div>
      {state.message && !state.ok && <p className="mt-2 text-xs font-semibold">{state.message}</p>}
    </form>
  );
}
