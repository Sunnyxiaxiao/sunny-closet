/**
 * A refund made in Stripe (charge.refunded webhook): the order that owed it is marked refunded once the refunded total
 * covers what was owed. Partial refunds leave it due. Orders are matched by the payment's PaymentIntent.
 * Database comes in as `markRefunded` (tests: tests/unit/refunds.test.ts).
 */
export async function recordStripeRefund(
  charge: { payment_intent: string | { id: string } | null; amount_refunded: number },
  markRefunded: (paymentIntentId: string, refundedCents: number) => Promise<number>,
): Promise<number> {
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intent || charge.amount_refunded <= 0) return 0;
  return markRefunded(intent, charge.amount_refunded);
}
