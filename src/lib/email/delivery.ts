import type { EmailKind } from "@/lib/supabase/database.types";
import type { EmailMessage } from "@/lib/email/templates";

/**
 * Order emails, recorded so none is lost silently: each one is logged ("sending") before it is sent and marked sent or
 * failed after. The scheduled sweep retries failed ones (and ones stuck "sending", e.g. the server stopped mid-send) up to
 * MAX_AUTO_ATTEMPTS times; the admin sees what still failed and can resend or dismiss it.
 * Database and mail come in as `deps` (tests: tests/unit/email-delivery.test.ts).
 */

export const MAX_AUTO_ATTEMPTS = 3;
/** A "sending" entry older than this was cut off (the send itself times out long before) */
export const STUCK_AFTER_MINUTES = 15;

export type EmailParams = Record<string, unknown>;

export interface EmailLogEntry {
  id: string;
  bookingId: string;
  kind: EmailKind;
  params: EmailParams;
  status: "sending" | "sent" | "failed" | "dismissed";
  attempts: number;
  updatedAt: Date;
}

export interface EmailLogStore {
  /** Logs a new email as "sending", first attempt; returns it */
  create(bookingId: string, kind: EmailKind, params: EmailParams): Promise<EmailLogEntry>;
  /** Takes a failed (or stuck) entry for another attempt: "sending", attempts + 1, only if it is still as read; null otherwise */
  claim(entry: EmailLogEntry, stuckBefore: Date): Promise<EmailLogEntry | null>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** Failed or stuck entries with fewer than maxAttempts attempts */
  retryable(maxAttempts: number, stuckBefore: Date): Promise<EmailLogEntry[]>;
  get(id: string): Promise<EmailLogEntry | null>;
}

export interface DeliveryDeps {
  store: EmailLogStore;
  /** The email for this order now; null if there is nothing to send (the order is gone) */
  build(bookingId: string, kind: EmailKind, params: EmailParams): Promise<EmailMessage | null>;
  /** Sends; throws with the reason when it couldn't */
  send(message: EmailMessage): Promise<void>;
  now: () => Date;
}

const stuckBefore = (deps: DeliveryDeps) => new Date(deps.now().getTime() - STUCK_AFTER_MINUTES * 60_000);

/** PostgREST filter for entries not sent: failed, or "sending" since before `stuckBefore` */
export function unsentFilter(stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000)) {
  return `status.eq.failed,and(status.eq.sending,updated_at.lt.${stuckBefore.toISOString()})`;
}

async function attempt(deps: DeliveryDeps, entry: EmailLogEntry): Promise<boolean> {
  try {
    const message = await deps.build(entry.bookingId, entry.kind, entry.params);
    if (!message) throw new Error("找不到这张订单");
    await deps.send(message);
  } catch (error) {
    await deps.store.markFailed(entry.id, (error instanceof Error ? error.message : String(error)).slice(0, 500));
    return false;
  }
  await deps.store.markSent(entry.id);
  return true;
}

/** Logs and sends one order email; true if it went out (a failure stays logged for the retry / the admin) */
export async function deliver(deps: DeliveryDeps, bookingId: string, kind: EmailKind, params: EmailParams = {}) {
  return attempt(deps, await deps.store.create(bookingId, kind, params));
}

/** Part of the scheduled sweep: tries failed and stuck emails again, a few times at most */
export async function retryFailed(deps: DeliveryDeps): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const before = stuckBefore(deps);
  for (const entry of await deps.store.retryable(MAX_AUTO_ATTEMPTS, before)) {
    const claimed = await deps.store.claim(entry, before);
    if (!claimed) continue;
    if (await attempt(deps, claimed)) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/** The admin's "resend": one more attempt, however many there were; false if it failed again or was already sent */
export async function resend(deps: DeliveryDeps, id: string): Promise<boolean> {
  const entry = await deps.store.get(id);
  if (!entry) return false;
  const claimed = await deps.store.claim(entry, stuckBefore(deps));
  return claimed ? attempt(deps, claimed) : false;
}
