import "server-only";
import { after } from "next/server";
import {
  acceptOrder as acceptWith,
  declineOrder as declineWith,
  sweepAcceptance as sweepWith,
  type AcceptanceDeps,
  type AcceptanceStore,
} from "@/lib/booking/acceptance";
import {
  notifyAcceptanceReminder,
  notifyOrderConfirmed,
  notifyOrderDeclined,
  notifyRefundDue,
} from "@/lib/email/order-notifications";
import { publicOrigin } from "@/lib/site-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Short-notice shipping orders the owner accepts or declines (rules: src/lib/booking/acceptance.ts), connected to the
 * database (service role: admins can't write payment and refund columns) and the emails.
 */

export async function acceptOrder(bookingId: string) {
  return acceptWith(await deps(), bookingId);
}

export async function declineOrder(bookingId: string) {
  return declineWith(await deps(), bookingId);
}

export async function sweepAcceptance() {
  return sweepWith(await deps());
}

async function deps(): Promise<AcceptanceDeps> {
  const origin = await publicOrigin();
  return {
    store: supabaseStore(),
    now: () => new Date(),
    onAccepted: (id) => after(() => notifyOrderConfirmed(id, origin)),
    onDeclined: (id, refundCents, automatic) =>
      after(async () => {
        await notifyOrderDeclined(id, refundCents, origin);
        if (automatic && refundCents > 0) await notifyRefundDue(id, refundCents, "declined", origin);
      }),
    onRemind: (id, deadline) => after(() => notifyAcceptanceReminder(id, deadline, origin)),
  };
}

function supabaseStore(): AcceptanceStore {
  const service = createSupabaseServiceClient();
  return {
    async accept(bookingId) {
      const { data, error } = await service
        .from("bookings")
        .update({ status: "confirmed", acceptance_status: "accepted", acceptance_decided_at: new Date().toISOString() })
        .eq("id", bookingId)
        .is("parent_booking_id", null)
        .eq("status", "pending")
        .eq("acceptance_status", "awaiting")
        .not("paid_at", "is", null)
        .select("id");
      if (error) throw new Error(`接单失败：${error.message}`);
      return data.length > 0;
    },
    async decline(bookingId) {
      const decided = { status: "cancelled" as const, acceptance_status: "declined" as const, acceptance_decided_at: new Date().toISOString() };
      // Paid or not decides whether a refund is owed; each update only applies if the payment state is still the one read
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: order, error: readError } = await service
          .from("bookings")
          .select("paid_at, paid_cents")
          .eq("id", bookingId)
          .eq("status", "pending")
          .eq("acceptance_status", "awaiting")
          .is("parent_booking_id", null)
          .maybeSingle();
        if (readError) throw new Error(`读取订单失败：${readError.message}`);
        if (!order) return null;
        const refundCents = order.paid_at ? (order.paid_cents ?? 0) : 0;
        let update = service
          .from("bookings")
          .update(refundCents > 0 ? { ...decided, refund_status: "due", refund_cents: refundCents } : decided)
          .eq("id", bookingId)
          .eq("status", "pending")
          .eq("acceptance_status", "awaiting");
        update = order.paid_at ? update.not("paid_at", "is", null) : update.is("paid_at", null);
        const { data, error } = await update.select("id");
        if (error) throw new Error(`拒单失败：${error.message}`);
        if (data.length > 0) return { refundCents };
      }
      return null;
    },
    async awaitingPaid() {
      const { data, error } = await service
        .from("bookings")
        .select("id, paid_at, acceptance_reminded_at")
        .is("parent_booking_id", null)
        .eq("status", "pending")
        .eq("acceptance_status", "awaiting")
        .not("paid_at", "is", null)
        .order("paid_at")
        .limit(200);
      if (error) throw new Error(`读取等待接单的订单失败：${error.message}`);
      return data.map((o) => ({
        id: o.id,
        paidAt: new Date(o.paid_at!),
        remindedAt: o.acceptance_reminded_at ? new Date(o.acceptance_reminded_at) : null,
      }));
    },
    async markReminded(bookingId) {
      const { data, error } = await service
        .from("bookings")
        .update({ acceptance_reminded_at: new Date().toISOString() })
        .eq("id", bookingId)
        .is("acceptance_reminded_at", null)
        .select("id");
      if (error) throw new Error(`记录提醒失败：${error.message}`);
      return data.length > 0;
    },
  };
}
