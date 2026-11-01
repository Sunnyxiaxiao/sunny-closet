import "server-only";
import Stripe from "stripe";
import { after } from "next/server";
import { localePath, type Locale } from "@/i18n/config";
import { notifyNewOrder, notifyOrderConfirmed } from "@/lib/email/order-notifications";
import { publicOrigin } from "@/lib/site-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages } from "@/messages";

/**
 * Card payments with Stripe: customers pay rental + shipping at checkout (or, for local pickup, save a card and pay in person),
 * which confirms the order; the card is saved so the admin can later charge it for serious damage, loss or a late return.
 * Without STRIPE_SECRET_KEY this is off and orders go through the manual flow (admin confirms, customer pays by Zelle / Venmo).
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

/** How long an unpaid order holds its dates (Stripe's minimum for a Checkout session) */
export const PAYMENT_WINDOW_MINUTES = 30;

/**
 * Opens a Stripe Checkout page for an order that's waiting on the customer, and returns its URL:
 *   - card orders: a payment page for rental + add-ons + shipping (one line each, from the stored order), saving the card;
 *   - in_person_card orders: a card-saving page (setup mode) that charges nothing; the rental is paid in person.
 * The latest session id is stored on the order, so only that session's expiry can cancel the order.
 */
export async function createOrderCheckout(bookingNo: string, locale: Locale): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data: main, error } = await service
    .from("bookings")
    .select(
      "id, booking_no, status, style_id, rental_cents, shipping_cents, customer_name, customer_email, stripe_customer_id, parent_booking_id, payment_method",
    )
    .eq("booking_no", bookingNo)
    .maybeSingle();
  if (error) throw new Error(`读取订单失败：${error.message}`);
  if (!main || main.parent_booking_id || main.status !== "pending" || main.payment_method === "in_person") {
    throw new Error("order_not_payable");
  }
  const saveCardOnly = main.payment_method === "in_person_card";
  const t = getMessages(locale).payment;

  const stripe = getStripe();
  // One Stripe customer per order; reused when the customer retries
  let customerId = main.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: main.customer_name,
      email: main.customer_email,
      metadata: { booking_no: main.booking_no },
    });
    customerId = customer.id;
  }

  const origin = await publicOrigin();
  const metadata = { booking_id: main.id, booking_no: main.booking_no, locale };
  const common = {
    customer: customerId,
    // Cards only (wallets like Apple Pay included): they can be charged again later without the customer present,
    // unlike bank debits or buy-now-pay-later
    allowed_payment_method_types: ["card" as const],
    locale: locale === "zh" ? ("zh" as const) : ("en" as const),
    metadata,
    custom_text: { submit: { message: t.authorization } },
    expires_at: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_MINUTES * 60,
    success_url: `${origin}/api/stripe/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${localePath(locale, `/booking/${main.booking_no}`)}`,
  };

  const session = saveCardOnly
    ? await stripe.checkout.sessions.create({
        ...common,
        mode: "setup",
        currency: "usd",
        setup_intent_data: { description: `Sunny Closet ${main.booking_no} (card on file instead of a deposit)`, metadata },
      })
    : await stripe.checkout.sessions.create({
        ...common,
        mode: "payment",
        line_items: (await orderLineItems(main, locale)).map((i) => ({
          quantity: 1,
          price_data: { currency: "usd", unit_amount: i.cents, product_data: { name: i.name } },
        })),
        // Save the card for later charges (damage, loss, late return) made while the customer isn't on the site
        payment_intent_data: { setup_future_usage: "off_session", description: `Sunny Closet ${main.booking_no}`, metadata },
      });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  const { error: saveError } = await service
    .from("bookings")
    .update({
      payment_method: saveCardOnly ? "in_person_card" : "card",
      stripe_customer_id: customerId,
      stripe_checkout_session_id: session.id,
    })
    .eq("id", main.id);
  if (saveError) throw new Error(`保存付款信息失败：${saveError.message}`);
  return session.url;
}

/** Payment page lines: each item, each helmet-cover add-on, and shipping (bundle parts are $0 and left out) */
async function orderLineItems(
  main: { id: string; style_id: string; rental_cents: number; shipping_cents: number },
  locale: Locale,
): Promise<{ name: string; cents: number }[]> {
  const service = createSupabaseServiceClient();
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

/**
 * Records a finished Checkout session and confirms the order: a payment (card orders) or a saved card (in_person_card orders).
 * Called when the customer lands back on the site and from the webhook, so it must be safe to run twice:
 * the status only moves pending → confirmed once, and the emails go out only for that move.
 * The session is fetched from Stripe with the secret key, so its metadata and amount can be trusted.
 */
export async function completeCheckout(sessionId: string): Promise<{ bookingNo: string; locale: string } | null> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent.payment_method", "setup_intent.payment_method"],
  });
  const bookingId = session.metadata?.booking_id;
  const bookingNo = session.metadata?.booking_no;
  const locale = session.metadata?.locale ?? "en";
  if ((session.mode !== "payment" && session.mode !== "setup") || !bookingId || !bookingNo) return null;
  const result = { bookingNo, locale };

  // The card used, from the payment or from the card-saving step
  let card: Stripe.PaymentMethod | null = null;
  let paid: { stripe_payment_intent_id: string; paid_cents: number; paid_at: string } | null = null;
  if (session.mode === "payment") {
    const intent = session.payment_intent;
    if (session.payment_status !== "paid" || !intent || typeof intent === "string") return result;
    card = typeof intent.payment_method === "object" ? intent.payment_method : null;
    paid = { stripe_payment_intent_id: intent.id, paid_cents: session.amount_total ?? 0, paid_at: new Date().toISOString() };
  } else {
    const setup = session.setup_intent;
    if (session.status !== "complete" || !setup || typeof setup === "string" || setup.status !== "succeeded") return result;
    card = typeof setup.payment_method === "object" ? setup.payment_method : null;
  }
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const details = {
    stripe_customer_id: customer ?? null,
    stripe_payment_method_id: card?.id ?? null,
    card_brand: card?.card?.brand ?? null,
    card_last4: card?.card?.last4 ?? null,
    card_saved_at: card ? new Date().toISOString() : null,
    ...paid,
  };

  const service = createSupabaseServiceClient();
  const { data: confirmed, error } = await service
    .from("bookings")
    .update({ ...details, status: "confirmed" })
    .eq("id", bookingId)
    .eq("status", "pending")
    .is("parent_booking_id", null)
    .select("id");
  if (error) throw new Error(`确认订单失败：${error.message}`);

  if (confirmed.length > 0) {
    const origin = await publicOrigin();
    after(async () => {
      await notifyNewOrder(bookingId, origin);
      await notifyOrderConfirmed(bookingId, origin);
    });
  } else if (paid) {
    // Already confirmed by an earlier call, or the order was cancelled before the payment landed:
    // still keep the payment details so the admin sees it was paid (and can refund it in Stripe)
    const { error: payError } = await service.from("bookings").update(details).eq("id", bookingId).is("paid_at", null);
    if (payError) throw new Error(`保存付款信息失败：${payError.message}`);
  }
  return result;
}

/**
 * Releases the dates of an order whose Stripe page (payment or card saving) expired before the customer finished.
 * Only cancels when the expired session is still the order's latest one (the customer may have opened a new one);
 * a finished session has already moved the order out of "pending".
 */
export async function cancelUnpaidOrder(sessionId: string): Promise<void> {
  const { error } = await createSupabaseServiceClient()
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("status", "pending");
  if (error) throw new Error(`取消未付款订单失败：${error.message}`);
}

/**
 * Same as the webhook's expiry handling, for when the webhook isn't set up (e.g. local development):
 * the order page calls this for unpaid orders, and cancels the order once its latest payment page has expired.
 */
export async function expireIfPaymentLapsed(sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.status !== "expired") return false;
  await cancelUnpaidOrder(sessionId);
  return true;
}
