import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localePath } from "@/i18n/config";
import { completeCheckout, getStripe, stripeEnabled } from "@/lib/stripe";

/**
 * Stripe sends the customer here after paying (?session_id=cs_...).
 * The payment is recorded and the order confirmed (the webhook does the same, in case the customer closes the tab first), then back to the order page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const sessionId = searchParams.get("session_id");
  if (!stripeEnabled() || !sessionId?.startsWith("cs_")) return NextResponse.redirect(new URL("/", origin));

  try {
    const paid = await completeCheckout(sessionId);
    if (!paid) return NextResponse.redirect(new URL("/", origin));
    const locale = isLocale(paid.locale) ? paid.locale : "en";
    return NextResponse.redirect(new URL(localePath(locale, `/booking/${paid.bookingNo}?paid=1`), origin));
  } catch (error) {
    console.error("[stripe/checkout-return] 记录付款失败", error);
    // The payment went through at Stripe; the webhook / sweep will record it. Send the customer to their order rather than
    // the home page (the order page settles the order again when viewed)
    return NextResponse.redirect(new URL((await orderPathOf(sessionId)) ?? "/", origin));
  }
}

/** The order page of a Checkout session, from its metadata (null if Stripe can't be reached either) */
async function orderPathOf(sessionId: string): Promise<string | null> {
  try {
    const { metadata } = await getStripe().checkout.sessions.retrieve(sessionId);
    if (!metadata?.booking_no) return null;
    return localePath(isLocale(metadata.locale) ? metadata.locale : "en", `/booking/${metadata.booking_no}`);
  } catch {
    return null;
  }
}
