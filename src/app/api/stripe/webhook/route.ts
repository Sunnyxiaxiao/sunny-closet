import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { recordStripeRefund } from "@/lib/payments/refunds";
import { completeCheckout, expireCheckout, getStripe, stripeEnabled } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Stripe webhook (endpoint: https://<domain>/api/stripe/webhook). Events to send:
 *   - checkout.session.completed: an order was paid, or a card saved instead of a deposit (backup for when the customer closes the tab first)
 *   - checkout.session.expired: the Stripe page timed out unfinished, so the order is cancelled and its dates released
 *     (only if that page is the order's current payment attempt)
 *   - payment_intent.succeeded / payment_intent.payment_failed: final result of a damage / late-return charge that was still processing
 *   - charge.refunded: a refund made in Stripe; an order that owed it (declined short-notice order, payment after cancelling,
 *     second payment) is marked refunded
 * The signature is checked with STRIPE_WEBHOOK_SECRET, so requests that don't come from Stripe are rejected.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeEnabled() || !secret) return new NextResponse("Not configured", { status: 404 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await completeCheckout(event.data.object.id);
    } else if (event.type === "checkout.session.expired") {
      await expireCheckout(event.data.object);
    } else if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      // Only charges made from the admin are in card_charges; checkout payments match no row and are ignored here.
      // A charge whose result was unknown has no Stripe id saved yet: it's found by the charge id in the metadata
      const intent = event.data.object;
      const failed = event.type === "payment_intent.payment_failed";
      const chargeId = intent.metadata?.charge_id;
      const update = createSupabaseServiceClient()
        .from("card_charges")
        .update({
          status: failed ? "failed" : "succeeded",
          stripe_payment_intent_id: intent.id,
          failure_message: failed ? (intent.last_payment_error?.message ?? "Payment failed") : null,
          updated_at: new Date().toISOString(),
        });
      const { error } = await (chargeId ? update.eq("id", chargeId) : update.eq("stripe_payment_intent_id", intent.id));
      if (error) throw new Error(error.message);
    } else if (event.type === "charge.refunded") {
      await recordStripeRefund(event.data.object, async (intent, refundedCents) => {
        const { data, error } = await createSupabaseServiceClient()
          .from("bookings")
          .update({ refund_status: "refunded", refunded_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", intent)
          .eq("refund_status", "due")
          .lte("refund_cents", refundedCents)
          .select("id");
        if (error) throw new Error(error.message);
        return data.length;
      });
    }
  } catch (error) {
    // A 500 makes Stripe retry the event later
    console.error("[stripe/webhook] 处理事件失败", event.type, error);
    return new NextResponse("Handler failed", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
