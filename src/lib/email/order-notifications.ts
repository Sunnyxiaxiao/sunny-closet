import "server-only";
import type { IsoDate } from "@/lib/dates";
import {
  deliver,
  resend,
  retryFailed,
  unsentFilter,
  type DeliveryDeps,
  type EmailLogEntry,
  type EmailParams,
} from "@/lib/email/delivery";
import { adminNotifyEmail, sendEmail, sendEmailOrThrow } from "@/lib/email/send";
import { cardLabel } from "@/lib/booking/card-payment";
import { alertOverdueConflicts } from "@/lib/booking/overdue-alerts";
import {
  acceptanceReminderEmail,
  awaitingAcceptanceEmail,
  newOrderEmail,
  orderDeclinedEmail,
  orderConfirmedEmail,
  overdueConflictEmail,
  refundDueEmail,
  type OrderEmailData,
} from "@/lib/email/templates";
import type { EmailKind, EmailLogRow } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** 读取一笔订单（主订单 + 购物车里的其他件 + 加购的头盔套）用来写邮件；组合套装里的 0 元单品不列出 */
async function loadOrder(bookingId: string): Promise<OrderEmailData | null> {
  const service = createSupabaseServiceClient();
  const columns =
    "id, booking_no, style_id, size, start_date, end_date, rental_days, rental_cents, deposit_cents, shipping_cents, total_cents, lead_days, tail_days, fulfillment_method, shipping_address, customer_name, customer_email, customer_phone, customer_note, cart_item, bundle_part, parent_booking_id";
  const [{ data: main, error }, { data: children, error: childError }, { data: payment, error: paymentError }] = await Promise.all([
    service.from("bookings").select(columns).eq("id", bookingId).maybeSingle(),
    service.from("bookings").select(columns).eq("parent_booking_id", bookingId).eq("bundle_part", false).order("booking_no"),
    service
      .from("bookings")
      .select("payment_method, cash_deposit_cents, paid_cents, card_brand, card_last4, rush_fee_cents, acceptance_status")
      .eq("id", bookingId)
      .maybeSingle(),
  ]);
  if (error || childError || paymentError) throw new Error(`读取订单失败：${(error ?? childError ?? paymentError)!.message}`);
  if (!main || main.parent_booking_id) return null;

  const all = [main, ...(children ?? [])];
  const { data: styles } = await service
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [...new Set(all.map((b) => b.style_id))]);
  const names = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    const join = (name: string | undefined) => [s?.brand, name].filter(Boolean).join(" ") || "—";
    return { name: join(s?.name), nameEn: join(s?.name_en || s?.name) };
  };

  const lines = [main, ...(children ?? []).filter((c) => c.cart_item)];
  return {
    bookingNo: main.booking_no,
    customerName: main.customer_name,
    customerEmail: main.customer_email,
    customerPhone: main.customer_phone,
    customerNote: main.customer_note,
    fulfillment: main.fulfillment_method,
    shippingAddress: main.shipping_address,
    lines: lines.map((l) => ({
      ...names(l.style_id),
      size: l.size,
      start: l.start_date as IsoDate,
      end: l.end_date as IsoDate,
      rentalDays: l.rental_days,
      rentalCents: l.rental_cents,
      depositCents: l.deposit_cents,
      leadDays: l.lead_days,
      tailDays: l.tail_days,
    })),
    addOns: (children ?? []).filter((c) => !c.cart_item).map((a) => ({ ...names(a.style_id), cents: a.rental_cents })),
    shippingCents: main.shipping_cents,
    rushFeeCents: payment?.rush_fee_cents ?? 0,
    acceptance: payment?.acceptance_status ?? null,
    totalCents: all.reduce((sum, b) => sum + b.total_cents, 0),
    payment: {
      method: payment?.payment_method ?? null,
      paidCents: payment?.paid_cents ?? null,
      card: payment?.card_brand && payment.card_last4 ? cardLabel(payment.card_brand, payment.card_last4) : null,
      cashDepositCents: payment?.cash_deposit_cents ?? 0,
    },
  };
}

/** 有人下单：通知店主（在 after() 里调用，不拖慢下单） */
export async function notifyNewOrder(bookingId: string, origin: string) {
  await deliverOrderEmail(bookingId, "new_order", {}, origin);
}

/** 订单确认（店主手动确认，或顾客刷卡付款后自动确认）：告诉顾客付款情况 */
export async function notifyOrderConfirmed(bookingId: string, origin: string) {
  await deliverOrderEmail(bookingId, "order_confirmed", {}, origin);
}

/** A payment that has to be refunded (it landed on a cancelled order, or was a second payment): tell the owner */
export async function notifyRefundDue(
  bookingId: string,
  cents: number,
  reason: "cancelled" | "second_payment" | "declined",
  origin: string,
) {
  await deliverOrderEmail(bookingId, "refund_due", { cents, reason }, origin);
}

/** Scheduled sweep: email the owner about upcoming orders that a piece still out with an overdue order runs into (once each) */
export async function notifyOverdueConflicts(origin: string) {
  const service = createSupabaseServiceClient();
  return alertOverdueConflicts({
    list: async () => {
      const { data, error } = await service.rpc("overdue_conflicts");
      if (error) throw new Error(`读取逾期冲突失败：${error.message}`);
      return data.map((c) => ({
        lateBookingNo: c.late_booking_no,
        itemCode: c.item_code,
        holdUntil: c.hold_until,
        bookingId: c.booking_id,
        bookingNo: c.booking_no,
        startDate: c.start_date,
        alertedAt: c.alerted_at,
      }));
    },
    send: async (conflicts) => {
      if (!(await sendEmail(overdueConflictEmail({ to: adminNotifyEmail(), origin, conflicts })))) {
        throw new Error("逾期冲突提醒邮件没有发出");
      }
    },
    markAlerted: async (ids) => {
      const { error } = await service
        .from("bookings")
        .update({ overdue_conflict_alerted_at: new Date().toISOString() })
        .in("id", ids)
        .is("overdue_conflict_alerted_at", null);
      if (error) throw new Error(`标记已提醒失败：${error.message}`);
    },
  });
}

/** Short-notice shipping order paid, not accepted yet: tell the customer it's paid and the owner is checking */
export async function notifyAwaitingAcceptance(bookingId: string, origin: string) {
  await deliverOrderEmail(bookingId, "awaiting_acceptance", {}, origin);
}

/** The owner declined a short-notice shipping order (or it timed out): tell the customer, with the refund owed */
export async function notifyOrderDeclined(bookingId: string, refundCents: number, origin: string) {
  await deliverOrderEmail(bookingId, "order_declined", { refundCents }, origin);
}

/** Reminds the owner that a paid short-notice shipping order is still waiting to be accepted */
export async function notifyAcceptanceReminder(bookingId: string, deadline: Date, origin: string) {
  await deliverOrderEmail(bookingId, "acceptance_reminder", { deadline: deadline.toISOString() }, origin);
}

/** Logs and sends an order email (see delivery.ts); never throws, so the order flow goes on whatever happens */
async function deliverOrderEmail(bookingId: string, kind: EmailKind, params: EmailParams, origin: string) {
  try {
    await deliver(deliveryDeps(origin), bookingId, kind, params);
  } catch (error) {
    console.error(`[email] 订单邮件 ${kind} 没有记录或发送`, error);
  }
}

/** Scheduled sweep: tries failed order emails again */
export async function retryFailedEmails(origin: string) {
  return retryFailed(deliveryDeps(origin));
}

/** Admin: send a failed order email once more */
export async function resendEmail(id: string, origin: string) {
  return resend(deliveryDeps(origin), id);
}

/** The email of this kind for this order, as it stands now */
async function buildOrderEmail(bookingId: string, kind: EmailKind, params: EmailParams, origin: string) {
  if (kind === "refund_due" || kind === "acceptance_reminder") {
    const { data, error } = await createSupabaseServiceClient().from("bookings").select("booking_no").eq("id", bookingId).maybeSingle();
    if (error) throw new Error(`读取订单失败：${error.message}`);
    if (!data) return null;
    const to = adminNotifyEmail();
    return kind === "refund_due"
      ? refundDueEmail({
          to,
          origin,
          bookingNo: data.booking_no,
          cents: Number(params.cents),
          reason: params.reason as "cancelled" | "second_payment" | "declined",
        })
      : acceptanceReminderEmail({ to, origin, bookingNo: data.booking_no, deadline: new Date(String(params.deadline)) });
  }
  const order = await loadOrder(bookingId);
  if (!order) return null;
  switch (kind) {
    case "new_order":
      return newOrderEmail(order, { to: adminNotifyEmail(), origin });
    case "order_confirmed":
      return orderConfirmedEmail(order, { origin });
    case "awaiting_acceptance":
      return awaitingAcceptanceEmail(order, { origin });
    case "order_declined":
      return orderDeclinedEmail(order, { origin, refundCents: Number(params.refundCents) });
  }
}

function deliveryDeps(origin: string): DeliveryDeps {
  const service = createSupabaseServiceClient();
  const toEntry = (row: EmailLogRow): EmailLogEntry => ({
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    params: row.params,
    status: row.status,
    attempts: row.attempts,
    updatedAt: new Date(row.updated_at),
  });
  const check = <T>(result: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (result.error || result.data === null) throw new Error(`${what}：${result.error?.message ?? "没有返回数据"}`);
    return result.data;
  };
  return {
    build: (bookingId, kind, params) => buildOrderEmail(bookingId, kind, params, origin),
    send: sendEmailOrThrow,
    now: () => new Date(),
    store: {
      async create(bookingId, kind, params) {
        return toEntry(
          check(await service.from("email_log").insert({ booking_id: bookingId, kind, params }).select("*").single(), "记录邮件失败"),
        );
      },
      async claim(entry, stuckBefore) {
        const rows = check(
          await service
            .from("email_log")
            .update({ status: "sending", attempts: entry.attempts + 1, updated_at: new Date().toISOString() })
            .eq("id", entry.id)
            .eq("attempts", entry.attempts)
            .or(unsentFilter(stuckBefore))
            .select("*"),
          "更新邮件记录失败",
        );
        return rows.length > 0 ? toEntry(rows[0]) : null;
      },
      async markSent(id) {
        const now = new Date().toISOString();
        const { error } = await service
          .from("email_log")
          .update({ status: "sent", sent_at: now, updated_at: now, last_error: null })
          .eq("id", id);
        if (error) throw new Error(`更新邮件记录失败：${error.message}`);
      },
      async markFailed(id, reason) {
        const { error } = await service
          .from("email_log")
          .update({ status: "failed", last_error: reason, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(`更新邮件记录失败：${error.message}`);
      },
      async retryable(maxAttempts, stuckBefore) {
        const rows = check(
          await service
            .from("email_log")
            .select("*")
            .lt("attempts", maxAttempts)
            .or(unsentFilter(stuckBefore))
            .order("created_at")
            .limit(50),
          "读取待重发邮件失败",
        );
        return rows.map(toEntry);
      },
      async get(id) {
        const { data, error } = await service.from("email_log").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(`读取邮件记录失败：${error.message}`);
        return data ? toEntry(data) : null;
      },
    },
  };
}
