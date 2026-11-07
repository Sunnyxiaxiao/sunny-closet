import type Stripe from "stripe";

/**
 * Stripe Checkout for an order: open the payment page, record a finished one, cancel an order whose page expired,
 * and settle orders stuck waiting on Stripe. The rules that keep money and stock consistent:
 *
 *   - One payment attempt per order at a time. The database hands out the attempt (claim_checkout_attempt, under a row lock);
 *     its key is the Stripe idempotency key, so two requests at once get the same page, and it's in the page's metadata,
 *     so a page that was created but never saved can still be found (by listing the order's Stripe customer's sessions).
 *   - The order is only cancelled when Stripe says for sure that nothing can be paid: the attempt's page expired, or it was never created.
 *     A request that failed without an answer (timeout, network) keeps the order and its stock; the next look retries with the same key.
 *   - A payment that lands on a cancelled order, or a second payment, is kept as a refund due and the owner is emailed.
 *
 * Database and Stripe calls come in as `deps`, so the rules can be tested without either (tests/unit/checkout-flow.test.ts);
 * src/lib/stripe.ts passes the real ones.
 */

export type StripeLike = {
  customers: { create: Stripe["customers"]["create"] };
  checkout: {
    sessions: Pick<Stripe["checkout"]["sessions"], "create" | "retrieve" | "list" | "expire">;
  };
};

/** The order's payment attempt, as claim_checkout_attempt returns it */
export interface Attempt {
  key: string;
  expiresAt: Date;
  sessionId: string | null;
  customerId: string | null;
  created: boolean;
}

/** A main order waiting on Stripe, for opening its page or settling it */
export interface PayableOrder {
  id: string;
  bookingNo: string;
  customerName: string;
  customerEmail: string;
  /** Saves a card without charging (pay in person instead of a deposit) */
  saveCardOnly: boolean;
}

export interface WaitingOrder {
  id: string;
  createdAt: Date;
  attemptKey: string | null;
  attemptExpiresAt: Date | null;
  sessionId: string | null;
  customerId: string | null;
}

export interface PaymentDetails {
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_saved_at: string | null;
  stripe_payment_intent_id?: string;
  paid_cents?: number;
  paid_at?: string;
}

export interface PaymentStore {
  /** The main order if it's waiting on an online payment (pending, not paid, not pay-in-person), else null */
  payableOrder(bookingNo: string): Promise<PayableOrder | null>;
  /** Raises order_not_payable for an order that isn't waiting on Stripe */
  claimAttempt(bookingId: string, replaceKey?: string): Promise<Attempt>;
  /** Saves the Stripe customer if the order has none yet */
  saveCustomer(bookingId: string, customerId: string): Promise<void>;
  /** Saves the page on the order if `attemptKey` is still its attempt; false when the attempt was replaced meanwhile */
  saveSession(bookingId: string, attemptKey: string, sessionId: string): Promise<boolean>;
  /**
   * Records the payment / card details on a pending, unpaid order: "confirmed" (pending → confirmed), or "awaiting" for a
   * short-notice shipping order the owner hasn't accepted yet (stays pending, now paid); false if neither applied
   */
  confirmPaid(bookingId: string, details: PaymentDetails): Promise<"confirmed" | "awaiting" | false>;
  /**
   * A payment for an order that wasn't pending: "recorded" if it's the payment already on the order (the webhook and the
   * customer's return both report it), else it's kept as a refund due: "cancelled" (the order was cancelled before it landed)
   * or "second_payment"; "already_due" if a refund was already due (the owner was told then)
   */
  recordLatePayment(
    bookingId: string,
    details: Required<Pick<PaymentDetails, "stripe_payment_intent_id" | "paid_cents" | "paid_at">> & PaymentDetails,
  ): Promise<"recorded" | "cancelled" | "second_payment" | "already_due">;
  /** Cancels the order if it's still pending, unpaid and on this attempt (null = on no attempt at all); true if cancelled */
  cancelAttempt(bookingId: string, attemptKey: string | null): Promise<boolean>;
  /** Pre-attempt pages: cancels the pending, unpaid order whose saved page is this one */
  cancelBySession(sessionId: string): Promise<boolean>;
  /** Main orders still pending on Stripe (card / in_person_card, unpaid) */
  waitingOrders(): Promise<WaitingOrder[]>;
}

export interface CheckoutDeps {
  stripe: StripeLike;
  store: PaymentStore;
  now: () => Date;
  /** Everything the page shows that doesn't decide money: line items, texts, return URLs */
  pageParams(order: PayableOrder, locale: "zh" | "en"): Promise<SessionPageParams>;
  /** After the order is confirmed (emails to the owner and the customer) */
  onConfirmed(bookingId: string): void;
  /** Paid, but the owner has to accept it first (emails: "paid, waiting for the owner" / "accept or decline") */
  onAwaitingAcceptance(bookingId: string): void;
  /** A payment has to be refunded (email to the owner) */
  onRefundDue(bookingId: string, cents: number, reason: "cancelled" | "second_payment"): void;
}

export interface SessionPageParams {
  lineItems: { name: string; cents: number }[];
  submitMessage: string;
  successUrl: string;
  cancelUrl: string;
  paymentDescription: string;
  setupDescription: string;
}

/** How long an unpaid order holds its dates (Stripe's minimum for a Checkout session) */
export const PAYMENT_WINDOW_MINUTES = 30;

export class CheckoutError extends Error {
  constructor(
    /** order_not_payable: paid, cancelled or not an online order; busy: another request is opening the page right now */
    readonly code: "order_not_payable" | "busy",
  ) {
    super(code);
  }
}

const isStripeError = (error: unknown, type: string): error is { type: string; param?: string } =>
  typeof error === "object" && error !== null && (error as { type?: string }).type === type;

/**
 * Opens (or reopens) the order's Stripe page and returns its URL. Throws CheckoutError for orders that can't be paid
 * or while another request is opening the page; other errors mean the result is unknown (the order keeps its stock).
 */
export async function openCheckout(deps: CheckoutDeps, bookingNo: string, locale: "zh" | "en"): Promise<string> {
  const order = await deps.store.payableOrder(bookingNo);
  if (!order) throw new CheckoutError("order_not_payable");
  let attempt = await deps.store.claimAttempt(order.id);

  if (attempt.sessionId) {
    // The attempt's page is saved: reuse it while it's open
    const session = await deps.stripe.checkout.sessions.retrieve(attempt.sessionId);
    if (session.status === "open" && session.url) return session.url;
    if (session.status === "complete") {
      await completeCheckout(deps, session.id);
      throw new CheckoutError("order_not_payable");
    }
    attempt = await deps.store.claimAttempt(order.id, attempt.key);
  } else if (!attempt.created && attempt.expiresAt <= deps.now()) {
    // An attempt whose page was never saved and whose time is up: see whether Stripe has a page for it before replacing it
    const session = await findAttemptSession(deps, attempt);
    if (session?.status === "complete") {
      await completeCheckout(deps, session.id);
      throw new CheckoutError("order_not_payable");
    }
    attempt = await deps.store.claimAttempt(order.id, attempt.key);
  }

  try {
    return await createSession(deps, order, attempt, locale);
  } catch (error) {
    // Retrying an attempt that never reached Stripe after a few minutes: Stripe refuses its expiry time as too soon.
    // Had the page been created, Stripe would have returned it instead (same idempotency key), so start a new attempt once
    if (isStripeError(error, "StripeInvalidRequestError") && error.param === "expires_at") {
      return createSession(deps, order, await deps.store.claimAttempt(order.id, attempt.key), locale);
    }
    throw error;
  }
}

async function createSession(deps: CheckoutDeps, order: PayableOrder, attempt: Attempt, locale: "zh" | "en"): Promise<string> {
  // One Stripe customer per order, saved before any page is created: a page can then always be found through the customer
  let customerId = attempt.customerId;
  if (!customerId) {
    const customer = await deps.stripe.customers.create(
      { name: order.customerName, email: order.customerEmail, metadata: { booking_no: order.bookingNo } },
      { idempotencyKey: `customer:${order.id}` },
    );
    customerId = customer.id;
    await deps.store.saveCustomer(order.id, customerId);
  }

  const page = await deps.pageParams(order, locale);
  const metadata = { booking_id: order.id, booking_no: order.bookingNo, locale, attempt_key: attempt.key };
  const common = {
    customer: customerId,
    // Cards only (wallets like Apple Pay included): they can be charged again later without the customer present,
    // unlike bank debits or buy-now-pay-later
    allowed_payment_method_types: ["card" as const],
    locale,
    metadata,
    custom_text: { submit: { message: page.submitMessage } },
    // From the attempt, so a retry sends exactly the same request (Stripe compares them under one idempotency key)
    expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
    success_url: page.successUrl,
    cancel_url: page.cancelUrl,
  };
  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe.checkout.sessions.create(
      order.saveCardOnly
        ? {
            ...common,
            mode: "setup",
            currency: "usd",
            setup_intent_data: { description: page.setupDescription, metadata },
          }
        : {
            ...common,
            mode: "payment",
            line_items: page.lineItems.map((i) => ({
              quantity: 1,
              price_data: { currency: "usd", unit_amount: i.cents, product_data: { name: i.name } },
            })),
            // Save the card for later charges (damage, loss, late return) made while the customer isn't on the site
            payment_intent_data: { setup_future_usage: "off_session", description: page.paymentDescription, metadata },
          },
      { idempotencyKey: `checkout:${attempt.key}` },
    );
  } catch (error) {
    // Same key, different request (e.g. the same order opened in two languages at once): the other request's page wins
    if (isStripeError(error, "StripeIdempotencyError")) throw new CheckoutError("busy");
    throw error;
  }
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  if (!(await deps.store.saveSession(order.id, attempt.key, session.id))) {
    // The attempt was replaced while this page was being created: this page must never be paid
    await deps.stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    throw new CheckoutError("order_not_payable");
  }
  return session.url;
}

/** The attempt's page at Stripe, found through the order's Stripe customer (null = there is none) */
async function findAttemptSession(
  deps: CheckoutDeps,
  attempt: { key: string; customerId: string | null },
): Promise<Stripe.Checkout.Session | null> {
  // The customer is saved before any page is created, so no customer means no page
  if (!attempt.customerId) return null;
  const sessions = await deps.stripe.checkout.sessions.list({ customer: attempt.customerId, limit: 100 });
  return sessions.data.find((s) => s.metadata?.attempt_key === attempt.key) ?? null;
}

/**
 * Records a finished Checkout session and confirms the order: a payment (card orders) or a saved card (in_person_card orders).
 * Called when the customer lands back on the site and from the webhook, so it must be safe to run twice:
 * the status only moves pending → confirmed once, and the emails go out only for that move.
 * The session is fetched from Stripe with the secret key, so its metadata and amount can be trusted.
 */
export async function completeCheckout(
  deps: CheckoutDeps,
  sessionId: string,
): Promise<{ bookingNo: string; locale: string } | null> {
  const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
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
    paid = { stripe_payment_intent_id: intent.id, paid_cents: session.amount_total ?? 0, paid_at: deps.now().toISOString() };
  } else {
    const setup = session.setup_intent;
    if (session.status !== "complete" || !setup || typeof setup === "string" || setup.status !== "succeeded") return result;
    card = typeof setup.payment_method === "object" ? setup.payment_method : null;
  }
  const customer = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const details: PaymentDetails = {
    stripe_customer_id: customer,
    stripe_payment_method_id: card?.id ?? null,
    card_brand: card?.card?.brand ?? null,
    card_last4: card?.card?.last4 ?? null,
    card_saved_at: card ? deps.now().toISOString() : null,
    ...paid,
  };

  const outcome = await deps.store.confirmPaid(bookingId, details);
  if (outcome === "confirmed") {
    deps.onConfirmed(bookingId);
  } else if (outcome === "awaiting") {
    deps.onAwaitingAcceptance(bookingId);
  } else if (paid) {
    // The order wasn't pending: already confirmed by an earlier call, or cancelled before the payment landed
    const late = await deps.store.recordLatePayment(bookingId, { ...details, ...paid });
    if (late === "cancelled" || late === "second_payment") deps.onRefundDue(bookingId, paid.paid_cents, late);
  }
  return result;
}

/**
 * A Stripe page expired unfinished (webhook): releases the order's dates, but only if that page belongs to the order's
 * current attempt (the customer may have opened a new one) and the order is still unpaid.
 */
export async function expireCheckout(deps: CheckoutDeps, session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  const attemptKey = session.metadata?.attempt_key;
  if (bookingId && attemptKey) await deps.store.cancelAttempt(bookingId, attemptKey);
  // Pages opened before attempts existed: matched by the saved page
  else await deps.store.cancelBySession(session.id);
}

/**
 * Settles one order waiting on Stripe once its attempt's time is up (the payment sweep, and the order page when it's viewed):
 * confirms it if the page was paid, cancels it if the page expired or was never created, and otherwise leaves it alone.
 * Returns what happened.
 */
export async function settleWaitingOrder(
  deps: CheckoutDeps,
  order: WaitingOrder,
): Promise<"confirmed" | "cancelled" | "open" | "not_due"> {
  const now = deps.now();
  if (!order.attemptKey) {
    // Never got as far as claiming an attempt (nothing was sent to Stripe): give it the payment window, then release it
    if (now.getTime() - order.createdAt.getTime() < (PAYMENT_WINDOW_MINUTES + 5) * 60_000) return "not_due";
    return (await deps.store.cancelAttempt(order.id, null)) ? "cancelled" : "not_due";
  }
  if (!order.attemptExpiresAt || order.attemptExpiresAt > now) return "not_due";

  const session = order.sessionId
    ? await deps.stripe.checkout.sessions.retrieve(order.sessionId)
    : await findAttemptSession(deps, { key: order.attemptKey, customerId: order.customerId });
  if (session?.status === "complete") {
    await completeCheckout(deps, session.id);
    return "confirmed";
  }
  if (session?.status === "open") {
    // Not expired yet at Stripe (clocks differ slightly): look again next time
    if (!order.sessionId) await deps.store.saveSession(order.id, order.attemptKey, session.id);
    return "open";
  }
  // Expired, or never created
  return (await deps.store.cancelAttempt(order.id, order.attemptKey)) ? "cancelled" : "not_due";
}

/** The payment sweep: settles every order whose payment attempt is over. Returns a count per outcome */
export async function sweepWaitingOrders(deps: CheckoutDeps): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const order of await deps.store.waitingOrders()) {
    let outcome: string;
    try {
      outcome = await settleWaitingOrder(deps, order);
    } catch (error) {
      // Unknown (e.g. Stripe unreachable): leave the order as it is and try again next run
      console.error("[payment sweep] 处理订单失败", order.id, error);
      outcome = "error";
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}
