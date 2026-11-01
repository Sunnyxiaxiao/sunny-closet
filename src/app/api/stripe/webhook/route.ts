import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { cancelUnpaidOrder, completeCheckout, getStripe, stripeEnabled } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Stripe webhook (endpoint: https://<domain>/api/stripe/webhook). Events to send:
 *   - checkout.session.completed: an order was paid, or a card saved instead of a deposit (backup for when the customer closes the tab first)
 *   - checkout.session.expired: the Stripe page timed out unfinished, so the order is cancelled and its dates released
 *   - payment_intent.succeeded / payment_intent.payment_failed: final result of a damage / late-return charge that was still processing
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
      await cancelUnpaidOrder(event.data.object.id);
    } else if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      // Only charges made from the admin are in card_charges; checkout payments match no row and are ignored here
      const intent = event.data.object;
      const failed = event.type === "payment_intent.payment_failed";
      const { error } = await createSupabaseServiceClient()
        .from("card_charges")
        .update({
          status: failed ? "failed" : "succeeded",
          failure_message: failed ? (intent.last_payment_error?.message ?? "Payment failed") : null,
        })
        .eq("stripe_payment_intent_id", intent.id);
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    // A 500 makes Stripe retry the event later
    console.error("[stripe/webhook] 处理事件失败", event.type, error);
    return new NextResponse("Handler failed", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
