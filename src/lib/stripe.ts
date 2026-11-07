import "server-only";
import Stripe from "stripe";
import { after } from "next/server";
import { localePath, type Locale } from "@/i18n/config";
import {
  notifyAwaitingAcceptance,
  notifyNewOrder,
  notifyOrderConfirmed,
  notifyRefundDue,
} from "@/lib/email/order-notifications";
import {
  CheckoutError,
  completeCheckout as completeWith,
  expireCheckout as expireWith,
  openCheckout,
  PAYMENT_WINDOW_MINUTES,
  settleWaitingOrder,
  sweepWaitingOrders as sweepWith,
  type CheckoutDeps,
  type PaymentStore,
  type WaitingOrder,
} from "@/lib/payments/checkout";
import { publicOrigin } from "@/lib/site-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages } from "@/messages";

export { CheckoutError, PAYMENT_WINDOW_MINUTES };

/**
 * Card payments with Stripe: customers pay rental + shipping at checkout (or, for local pickup, save a card and pay in person),
 * which confirms the order; the card is saved so the admin can later charge it for serious damage, loss or a late return.
 * Without STRIPE_SECRET_KEY this is off and orders go through the manual flow (admin confirms, customer pays by Zelle / Venmo).
 * The rules for opening, finishing and expiring payment pages are in src/lib/payments/checkout.ts; this file connects them
 * to Stripe, the database and the emails.
 */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | undefined;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

/** Opens (or reopens) the Stripe page of an order that's waiting on the customer, and returns its URL */
export async function createOrderCheckout(bookingNo: string, locale: Locale): Promise<string> {
  return openCheckout(await deps(), bookingNo, locale);
}

/** Records a finished Checkout session and confirms the order (safe to call twice) */
export async function completeCheckout(sessionId: string) {
  return completeWith(await deps(), sessionId);
}

/** Webhook: a Stripe page expired unfinished */
export async function expireCheckout(session: Stripe.Checkout.Session): Promise<void> {
  return expireWith(await deps(), session);
}

/** The payment sweep (scheduled): settles orders whose payment attempt is over */
export async function sweepWaitingOrders() {
  return sweepWith(await deps());
}

/**
 * The order page settles its own order when viewed (backup for the webhook and the sweep, e.g. in local development).
 * Returns true if the order is now cancelled.
 */
export async function settleOrderOnView(bookingId: string): Promise<boolean> {
  const store = supabaseStore();
  const order = (await store.waitingOrders(bookingId))[0];
  if (!order) return false;
  return (await settleWaitingOrder(await deps(), order)) === "cancelled";
}

async function deps(): Promise<CheckoutDeps> {
  const origin = await publicOrigin();
  return {
    stripe: getStripe(),
    store: supabaseStore(),
    now: () => new Date(),
    pageParams: async (order, locale) => {
      const t = getMessages(locale).payment;
      return {
        lineItems: order.saveCardOnly ? [] : await orderLineItems(order.id, locale),
        submitMessage: t.authorization,
        successUrl: `${origin}/api/stripe/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${localePath(locale, `/booking/${order.bookingNo}`)}`,
        paymentDescription: `Sunny Closet ${order.bookingNo}`,
        setupDescription: `Sunny Closet ${order.bookingNo} (card on file instead of a deposit)`,
      };
    },
    onConfirmed: (bookingId) =>
      after(async () => {
        await notifyNewOrder(bookingId, origin);
        await notifyOrderConfirmed(bookingId, origin);
      }),
    onAwaitingAcceptance: (bookingId) =>
      after(async () => {
        await notifyNewOrder(bookingId, origin);
        await notifyAwaitingAcceptance(bookingId, origin);
      }),
    onRefundDue: (bookingId, cents, reason) => after(() => notifyRefundDue(bookingId, cents, reason, origin)),
  };
}

const WAITING_COLUMNS =
  "id, created_at, checkout_attempt_key, checkout_attempt_expires_at, stripe_checkout_session_id, stripe_customer_id";

/** The payment rules' database side (service role: customers can't write orders) */
function supabaseStore(): PaymentStore & { waitingOrders(bookingId?: string): Promise<WaitingOrder[]> } {
  const service = createSupabaseServiceClient();
  // Throws on a database error; `null` stays possible for maybeSingle() (callers check it)
  const check = <T>(result: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (result.error) throw new Error(`${what}：${result.error.message}`);
    return result.data as T;
  };
  return {
    async payableOrder(bookingNo) {
      const main: { id: string; booking_no: string; status: string; customer_name: string; customer_email: string; parent_booking_id: string | null; payment_method: string | null; paid_at: string | null } | null = check(
        await service
          .from("bookings")
          .select("id, booking_no, status, customer_name, customer_email, parent_booking_id, payment_method, paid_at")
          .eq("booking_no", bookingNo)
          .maybeSingle(),
        "读取订单失败",
      );
      if (!main || main.parent_booking_id || main.status !== "pending" || main.paid_at || main.payment_method === "in_person") {
        return null;
      }
      return {
        id: main.id,
        bookingNo: main.booking_no,
        customerName: main.customer_name,
        customerEmail: main.customer_email,
        saveCardOnly: main.payment_method === "in_person_card",
      };
    },
    async claimAttempt(bookingId, replaceKey) {
      const { data, error } = await service.rpc("claim_checkout_attempt", {
        p_booking_id: bookingId,
        p_replace_key: replaceKey ?? null,
      });
      if (error?.message.includes("order_not_payable")) throw new CheckoutError("order_not_payable");
      const row = check({ data, error }, "领取付款尝试失败")[0];
      return {
        key: row.attempt_key,
        expiresAt: new Date(row.expires_at),
        sessionId: row.session_id,
        customerId: row.customer_id,
        created: row.created,
      };
    },
    async saveCustomer(bookingId, customerId) {
      check(
        await service.from("bookings").update({ stripe_customer_id: customerId }).eq("id", bookingId).is("stripe_customer_id", null),
        "保存 Stripe 顾客失败",
      );
    },
    async saveSession(bookingId, attemptKey, sessionId) {
      const rows = check(
        await service
          .from("bookings")
          .update({ stripe_checkout_session_id: sessionId })
          .eq("id", bookingId)
          .eq("checkout_attempt_key", attemptKey)
          .select("id"),
        "保存付款页面失败",
      );
      return rows.length > 0;
    },
    async confirmPaid(bookingId, details) {
      // Pending and unpaid: confirmed, unless it's a short-notice order the owner hasn't accepted (then it only gets paid)
      const confirmed = check(
        await service
          .from("bookings")
          .update({ ...details, status: "confirmed" })
          .eq("id", bookingId)
          .eq("status", "pending")
          .is("parent_booking_id", null)
          .is("paid_at", null)
          .is("acceptance_status", null)
          .select("id"),
        "确认订单失败",
      );
      if (confirmed.length > 0) return "confirmed";
      const awaiting = check(
        await service
          .from("bookings")
          .update(details)
          .eq("id", bookingId)
          .eq("status", "pending")
          .is("parent_booking_id", null)
          .is("paid_at", null)
          .eq("acceptance_status", "awaiting")
          .select("id"),
        "保存付款信息失败",
      );
      return awaiting.length > 0 ? "awaiting" : false;
    },
    async recordLatePayment(bookingId, details) {
      const order: { paid_at: string | null; stripe_payment_intent_id: string | null } | null = check(
        await service
          .from("bookings")
          .select("paid_at, stripe_payment_intent_id, refund_status")
          .eq("id", bookingId)
          .maybeSingle(),
        "读取订单失败",
      );
      if (!order || order.stripe_payment_intent_id === details.stripe_payment_intent_id) return "recorded";
      if (!order.paid_at) {
        // Cancelled before the payment landed: keep the payment so the admin sees it, and owe it back
        const rows = check(
          await service
            .from("bookings")
            .update({ ...details, refund_status: "due", refund_cents: details.paid_cents })
            .eq("id", bookingId)
            .is("paid_at", null)
            .select("id"),
          "保存付款信息失败",
        );
        return rows.length > 0 ? "cancelled" : "recorded";
      }
      const rows = check(
        await service
          .from("bookings")
          .update({ refund_status: "due", refund_cents: details.paid_cents })
          .eq("id", bookingId)
          .is("refund_status", null)
          .select("id"),
        "保存待退款失败",
      );
      if (rows.length > 0) return "second_payment";
      console.error("[stripe] 又一笔需要退款的付款，订单已有待退款，请到 Stripe 核对", bookingId, details.stripe_payment_intent_id);
      return "already_due";
    },
    async cancelAttempt(bookingId, attemptKey) {
      let query = service
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId)
        .eq("status", "pending")
        .is("paid_at", null);
      query = attemptKey ? query.eq("checkout_attempt_key", attemptKey) : query.is("checkout_attempt_key", null);
      return check(await query.select("id"), "取消未付款订单失败").length > 0;
    },
    async cancelBySession(sessionId) {
      const rows = check(
        await service
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("stripe_checkout_session_id", sessionId)
          .eq("status", "pending")
          .is("paid_at", null)
          .select("id"),
        "取消未付款订单失败",
      );
      return rows.length > 0;
    },
    async waitingOrders(bookingId?: string) {
      let query = service
        .from("bookings")
        .select(WAITING_COLUMNS)
        .is("parent_booking_id", null)
        .eq("status", "pending")
        .is("paid_at", null)
        .in("payment_method", ["card", "in_person_card"]);
      if (bookingId) query = query.eq("id", bookingId);
      const rows = check(await query.order("created_at").limit(200), "读取待付款订单失败");
      return rows.map((r) => ({
        id: r.id,
        createdAt: new Date(r.created_at),
        attemptKey: r.checkout_attempt_key,
        attemptExpiresAt: r.checkout_attempt_expires_at ? new Date(r.checkout_attempt_expires_at) : null,
        sessionId: r.stripe_checkout_session_id,
        customerId: r.stripe_customer_id,
      }));
    },
  };
}

/** Payment page lines: each item, each helmet-cover add-on, and shipping (bundle parts are $0 and left out) */
async function orderLineItems(bookingId: string, locale: Locale): Promise<{ name: string; cents: number }[]> {
  const service = createSupabaseServiceClient();
  const { data: main, error: mainError } = await service
    .from("bookings")
    .select("id, style_id, rental_cents, shipping_cents")
    .eq("id", bookingId)
    .single();
  if (mainError) throw new Error(`读取订单失败：${mainError.message}`);
  const { data: children, error } = await service
    .from("bookings")
    .select("style_id, rental_cents, cart_item, bundle_part")
    .eq("parent_booking_id", main.id)
    .order("booking_no");
  if (error) throw new Error(`读取订单明细失败：${error.message}`);
  const { data: styles } = await service
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [main.style_id, ...children.map((c) => c.style_id)]);
  const styleName = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    return [s?.brand, (locale === "en" && s?.name_en) || s?.name].filter(Boolean).join(" ") || "Sunny Closet rental";
  };
  const t = getMessages(locale).payment;
  return [
    { name: styleName(main.style_id), cents: main.rental_cents },
    ...children
      .filter((c) => !c.bundle_part)
      .map((c) => ({ name: c.cart_item ? styleName(c.style_id) : t.addOnItem(styleName(c.style_id)), cents: c.rental_cents })),
    ...(main.shipping_cents > 0 ? [{ name: t.shippingItem, cents: main.shipping_cents }] : []),
  ].filter((i) => i.cents > 0);
}
