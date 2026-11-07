/**
 * Short-notice shipping orders without rush shipping: the customer pays as usual, but the owner decides whether the order
 * can go out in time. Paying keeps it pending ("awaiting"); the owner then accepts it (confirmed) or declines it
 * (cancelled, the payment owed back as a refund due). Unanswered ACCEPT_WINDOW_HOURS after payment, the sweep declines it,
 * after reminding the owner at REMIND_AFTER_HOURS.
 * Database and emails come in as `deps` (tests: tests/unit/acceptance.test.ts).
 */

export const ACCEPT_WINDOW_HOURS = 24;
export const REMIND_AFTER_HOURS = 12;
const HOUR = 3_600_000;

export interface AwaitingOrder {
  id: string;
  paidAt: Date;
  remindedAt: Date | null;
}

export interface AcceptanceStore {
  /** Paid and awaiting → confirmed / accepted; false if it wasn't (already decided, cancelled or not paid yet) */
  accept(bookingId: string): Promise<boolean>;
  /** Awaiting → cancelled / declined, a payment marked as a refund due; null if it wasn't awaiting. Returns the refund owed */
  decline(bookingId: string): Promise<{ refundCents: number } | null>;
  /** Paid orders still awaiting the owner */
  awaitingPaid(): Promise<AwaitingOrder[]>;
  /** Records the reminder; false if it was already sent */
  markReminded(bookingId: string): Promise<boolean>;
}

export interface AcceptanceDeps {
  store: AcceptanceStore;
  now: () => Date;
  onAccepted(bookingId: string): void;
  onDeclined(bookingId: string, refundCents: number, automatic: boolean): void;
  onRemind(bookingId: string, deadline: Date): void;
}

export async function acceptOrder(deps: AcceptanceDeps, bookingId: string): Promise<boolean> {
  const accepted = await deps.store.accept(bookingId);
  if (accepted) deps.onAccepted(bookingId);
  return accepted;
}

export async function declineOrder(deps: AcceptanceDeps, bookingId: string, automatic = false): Promise<boolean> {
  const declined = await deps.store.decline(bookingId);
  if (declined) deps.onDeclined(bookingId, declined.refundCents, automatic);
  return declined !== null;
}

/** Part of the scheduled sweep: reminds the owner, then declines orders left unanswered too long */
export async function sweepAcceptance(deps: AcceptanceDeps): Promise<{ reminded: number; declined: number }> {
  const now = deps.now().getTime();
  let reminded = 0;
  let declined = 0;
  for (const order of await deps.store.awaitingPaid()) {
    const waited = now - order.paidAt.getTime();
    if (waited >= ACCEPT_WINDOW_HOURS * HOUR) {
      if (await declineOrder(deps, order.id, true)) declined += 1;
    } else if (waited >= REMIND_AFTER_HOURS * HOUR && !order.remindedAt && (await deps.store.markReminded(order.id))) {
      deps.onRemind(order.id, new Date(order.paidAt.getTime() + ACCEPT_WINDOW_HOURS * HOUR));
      reminded += 1;
    }
  }
  return { reminded, declined };
}
