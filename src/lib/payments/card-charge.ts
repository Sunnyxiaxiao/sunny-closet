import type Stripe from "stripe";
import type { CardChargeStatus } from "@/lib/supabase/database.types";

/**
 * Charging a customer's saved card from the admin (serious damage, loss, late return), without ever charging twice:
 *   - each charge is recorded before Stripe is called (status "pending", with its own idempotency key), so it can be found again
 *     after a page refresh, on another device, or after a server restart;
 *   - Stripe's answer decides the status: succeeded / processing (the webhook finishes it) / failed (a clear decline or refusal);
 *   - no clear answer (network error, Stripe error) means "unknown": the charge may have gone through, so the only next step is
 *     retrying the same charge with the same key (Stripe returns the first result instead of charging again);
 *     after 24 hours Stripe forgets the key, so the charge is looked up at Stripe by its id in the metadata instead;
 *   - an order can't start a new charge while one is pending / unknown (unique index card_charges_one_open_idx).
 * Database and Stripe come in as `deps` (tests: tests/unit/card-charge.test.ts).
 */

export interface ChargeRow {
  id: string;
  bookingId: string;
  amountCents: number;
  reason: string;
  status: CardChargeStatus;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What Stripe needs to charge the order's saved card */
export interface ChargeTarget {
  bookingId: string;
  bookingNo: string;
  customerId: string;
  paymentMethodId: string;
}

export interface ChargeStore {
  /**
   * Records a new pending charge. "duplicate": a charge with this key exists (the same form submitted twice);
   * "busy": the order already has another charge pending / unknown
   */
  insertPending(
    target: ChargeTarget,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<ChargeRow | "duplicate" | "busy">;
  setResult(
    chargeId: string,
    result: { status: CardChargeStatus; intentId?: string | null; failure?: string | null },
  ): Promise<void>;
}

export interface ChargeDeps {
  stripe: { paymentIntents: Pick<Stripe["paymentIntents"], "create" | "search"> };
  store: ChargeStore;
  now: () => Date;
}

export type ChargeOutcome =
  | { status: "succeeded" | "processing"; message: string }
  | { status: "failed"; message: string }
  | { status: "unknown"; message: string }
  | { status: "busy" | "duplicate"; message: string };

/** Stripe keeps idempotency keys for 24 hours; retry with the key only well inside that */
const KEY_LIFETIME_MS = 23 * 60 * 60 * 1000;
/** A charge still "pending" after this long lost its answer (e.g. the server stopped mid-request): treat it as unknown */
const PENDING_STALE_MS = 2 * 60 * 1000;

const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Refusals that mean Stripe didn't charge: the card was declined, or the request itself was refused */
const DEFINITE_ERRORS = new Set([
  "StripeCardError",
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
]);

/** Starts a new charge on the order's saved card; `key` comes from the form, so submitting it twice is one charge */
export async function chargeCard(
  deps: ChargeDeps,
  target: ChargeTarget,
  amountCents: number,
  reason: string,
  key: string,
): Promise<ChargeOutcome> {
  const row = await deps.store.insertPending(target, amountCents, reason, key);
  if (row === "duplicate") return { status: "duplicate", message: "这笔扣款已经提交过了，结果见上面的扣款记录" };
  if (row === "busy") {
    return { status: "busy", message: "这单有一笔扣款的结果还没确定，请先在下面处理它（重试同一笔），再发起新的扣款" };
  }
  return send(deps, target, row);
}

/**
 * Retries a charge whose result is unknown (or stuck pending) with its original key, or, once the key has expired at Stripe,
 * looks the charge up there. Never creates a second charge.
 */
export async function retryCharge(deps: ChargeDeps, target: ChargeTarget, row: ChargeRow): Promise<ChargeOutcome> {
  const age = deps.now().getTime() - row.createdAt.getTime();
  const stuckPending = row.status === "pending" && deps.now().getTime() - row.updatedAt.getTime() > PENDING_STALE_MS;
  if (row.status !== "unknown" && !stuckPending) {
    return { status: "busy", message: "这笔扣款不需要重试" };
  }
  if (age < KEY_LIFETIME_MS) return send(deps, target, row);

  // The key has expired at Stripe: find the charge by its id instead of retrying
  const found = await deps.stripe.paymentIntents.search({ query: `metadata['charge_id']:'${row.id}'` });
  const intent = found.data[0];
  if (!intent) {
    await deps.store.setResult(row.id, { status: "failed", failure: "Stripe 上没有这笔扣款（之前没有扣成功）" });
    return { status: "failed", message: "Stripe 上没有这笔扣款，之前没有扣成功，可以重新发起" };
  }
  return record(deps, row, intent);
}

async function send(deps: ChargeDeps, target: ChargeTarget, row: ChargeRow): Promise<ChargeOutcome> {
  try {
    const intent = await deps.stripe.paymentIntents.create(
      {
        amount: row.amountCents,
        currency: "usd",
        customer: target.customerId,
        payment_method: target.paymentMethodId,
        off_session: true,
        confirm: true,
        description: `${target.bookingNo} · ${row.reason}`,
        metadata: { booking_id: target.bookingId, booking_no: target.bookingNo, charge_id: row.id },
      },
      { idempotencyKey: row.idempotencyKey },
    );
    return record(deps, row, intent);
  } catch (error) {
    const err = error as { type?: string; message?: string; payment_intent?: { id: string } };
    if (err.type && DEFINITE_ERRORS.has(err.type)) {
      const failure = err.message ?? "Stripe refused the charge";
      await deps.store.setResult(row.id, { status: "failed", intentId: err.payment_intent?.id ?? null, failure });
      return { status: "failed", message: `扣款失败：${failure}` };
    }
    // No clear answer: the charge may or may not have gone through
    await deps.store.setResult(row.id, { status: "unknown", failure: err.message ?? "Unknown error" });
    return {
      status: "unknown",
      message: "扣款结果未知（和 Stripe 的连接出了问题）。请先到 Stripe 后台核对，或点“重试同一笔”：不会重复扣款",
    };
  }
}

async function record(deps: ChargeDeps, row: ChargeRow, intent: Stripe.PaymentIntent): Promise<ChargeOutcome> {
  if (intent.status === "succeeded") {
    await deps.store.setResult(row.id, { status: "succeeded", intentId: intent.id, failure: null });
    return { status: "succeeded", message: `已扣款 ${money(row.amountCents)}` };
  }
  if (intent.status === "processing") {
    await deps.store.setResult(row.id, { status: "processing", intentId: intent.id, failure: null });
    return { status: "processing", message: "扣款处理中，结果出来后会自动更新" };
  }
  // e.g. requires_action: the bank wants the customer to verify, which can't happen while they're not on the site
  await deps.store.setResult(row.id, { status: "failed", intentId: intent.id, failure: `需要顾客验证（${intent.status}）` });
  return { status: "failed", message: "银行要求顾客本人验证，没法直接扣款，请联系顾客付款" };
}
