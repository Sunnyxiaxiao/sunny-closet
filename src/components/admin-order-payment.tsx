"use client";

import { useActionState } from "react";
import { chargeSavedCard, markPaidInPerson } from "@/app/admin/actions";
import type { CardChargeState } from "@/lib/admin/card-charge-state";
import { formatMoney } from "@/lib/money";
import type { CardChargeRow, PaymentMethod } from "@/lib/supabase/database.types";

const CHARGE_STATUS: Record<CardChargeRow["status"], string> = {
  succeeded: "已扣款",
  processing: "处理中",
  failed: "失败",
};

/**
 * 订单卡片里的付款情况：
 * 刷卡付款 —— 付了多少、用的哪张卡、之后扣过哪些钱，以及扣赔偿 / 逾期费的表单；
 * 当面付款 —— 应收多少，取件收到钱后点“标记已收款”
 */
export function AdminOrderPayment({
  bookingId,
  paymentMethod,
  orderTotalCents,
  cashDepositCents,
  paidCents,
  cardLabel,
  charges,
  initialNonce,
}: {
  bookingId: string;
  /** null = 手动流程（后台确认、Zelle / Venmo），或刷卡订单还没打开过付款页 */
  paymentMethod: PaymentMethod | null;
  orderTotalCents: number;
  /** 当面收的押金（只有“当面付租金 + 押金”的订单有） */
  cashDepositCents: number;
  /** 已付金额；null = 还没付款 */
  paidCents: number | null;
  /** 例如 "Visa •••• 4242"；没有留存的卡时为 null */
  cardLabel: string | null;
  charges: CardChargeRow[];
  initialNonce: string;
}) {
  const [state, action, pending] = useActionState<CardChargeState, FormData>(chargeSavedCard, { nonce: initialNonce });

  return (
    <div className="mt-5 border-t border-neutral-200 pt-4 text-sm">
      {paymentMethod === "in_person" || paymentMethod === "in_person_card" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>
            <span className="text-neutral-500">取件时当面付租金：</span>
            {paidCents !== null ? (
              <span className="font-semibold">已收 {formatMoney(paidCents)}</span>
            ) : (
              <span className="font-semibold text-amber-700">待收 {formatMoney(orderTotalCents)}</span>
            )}
            {paymentMethod === "in_person" ? (
              <span className="text-neutral-600"> · 另收押金 {formatMoney(cashDepositCents)}（归还后当面退）</span>
            ) : (
              <span className="text-neutral-600"> · 免押金，{cardLabel ? `已留卡 ${cardLabel}` : "还没留卡"}</span>
            )}
          </p>
          {paidCents === null && (
            <form action={markPaidInPerson}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <button type="submit" className="h-9 rounded-full bg-neutral-900 px-4 text-xs font-bold text-white hover:bg-neutral-700">
                标记已收款
              </button>
            </form>
          )}
        </div>
      ) : (
        <p>
          <span className="text-neutral-500">刷卡付款：</span>
          {paidCents !== null ? (
            <span className="font-semibold">
              已付 {formatMoney(paidCents)}
              {cardLabel && ` · ${cardLabel}`}
            </span>
          ) : (
            <span className="text-amber-700">未付款</span>
          )}
        </p>
      )}

      {charges.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {charges.map((c) => (
            <li key={c.id} className={c.status === "failed" ? "text-red-700" : "text-neutral-700"}>
              {CHARGE_STATUS[c.status]} {formatMoney(c.amount_cents)} · {c.reason}
              {c.failure_message && `（${c.failure_message}）`}
            </li>
          ))}
        </ul>
      )}

      {cardLabel && (
        <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="nonce" value={state.nonce} />
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="金额（美元）"
            aria-label="扣款金额（美元）"
            className="h-10 w-full border border-neutral-300 px-3 text-sm focus:border-neutral-900 focus:outline-none sm:w-36"
          />
          <input
            name="reason"
            required
            maxLength={200}
            placeholder="原因，例如：外套丢失，按零售价 / 逾期 2 天"
            aria-label="扣款原因"
            className="h-10 w-full flex-1 border border-neutral-300 px-3 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 shrink-0 rounded-full border border-red-300 px-5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {pending ? "扣款中…" : "从卡里扣款"}
          </button>
        </form>
      )}
      {state.message && (
        <p role="status" className={`mt-2 text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.message}
        </p>
      )}
      {paidCents !== null && paymentMethod === "card" && (
        <p className="mt-2 text-xs text-neutral-500">退款请在 Stripe 后台的 Payments 里操作。</p>
      )}
    </div>
  );
}
