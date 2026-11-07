"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { CardChargeState } from "@/lib/admin/card-charge-state";
import type { LoginState } from "@/lib/admin/login-state";
import type { ReturnDateState } from "@/lib/admin/return-date-state";
import { parseDollarsToCents } from "@/lib/booking/card-payment";
import { acceptOrder, declineOrder } from "@/lib/booking/acceptance-server";
import { canTransition, isBookingStatus } from "@/lib/booking/status";
import { notifyOrderConfirmed, resendEmail } from "@/lib/email/order-notifications";
import { publicOrigin } from "@/lib/site-url";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { chargeCard, retryCharge, type ChargeDeps, type ChargeTarget } from "@/lib/payments/card-charge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { message: "请输入邮箱和密码", email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: "邮箱或密码不对", email };

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { message: "这个账号没有管理员权限", email };
  }

  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

const statusChangeSchema = z.object({
  bookingId: z.uuid(),
  nextStatus: z.string(),
});

/**
 * Changes an order's status. The buttons are just a convenience; the real rules live here:
 * re-read the order's current status, allow only a valid next step, and update only if nobody changed the status in the meantime.
 */
export async function updateBookingStatus(formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = statusChangeSchema.safeParse({
    bookingId: formData.get("bookingId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!parsed.success) return;
  const bookingId = parsed.data.bookingId;
  const nextStatus = parsed.data.nextStatus;
  if (!isBookingStatus(nextStatus)) return;

  const { data: current, error: readError } = await supabase
    .from("bookings")
    .select("status, parent_booking_id, payment_method, acceptance_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError) throw new Error(`读取订单失败：${readError.message}`);

  // Order missing or the page is stale (status already changed): don't update; refresh to show the latest status.
  // Short-notice orders waiting to be accepted go through acceptShortNotice / declineShortNotice (a decline owes a refund)
  if (
    !current ||
    current.acceptance_status === "awaiting" ||
    !canTransition(current.status, nextStatus, current.payment_method)
  ) {
    revalidatePath("/admin");
    return;
  }

  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ status: nextStatus })
    .eq("id", bookingId)
    .eq("status", current.status)
    .select("id");
  if (error) throw new Error(`更新订单状态失败：${error.message}`);

  // Email the customer after confirming (payment methods, order link); child orders follow the main order, so only send for the main order.
  // Don't send if someone else changed the status concurrently (this update didn't apply)
  if (nextStatus === "confirmed" && !current.parent_booking_id && updated.length > 0) {
    const origin = await publicOrigin();
    after(() => notifyOrderConfirmed(bookingId, origin));
  }

  revalidatePath("/admin");
}

const adminNoteSchema = z.object({
  bookingId: z.uuid(),
  note: z.string().trim().max(1000),
});

export async function saveAdminNote(formData: FormData) {
  const { supabase } = await requireAdmin();

  const parsed = adminNoteSchema.safeParse({
    bookingId: formData.get("bookingId"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;

  const { error } = await supabase
    .from("bookings")
    .update({ admin_note: parsed.data.note })
    .eq("id", parsed.data.bookingId);
  if (error) throw new Error(`保存备注失败：${error.message}`);

  revalidatePath("/admin");
}

const cardChargeSchema = z.object({
  bookingId: z.uuid(),
  amount: z.string(),
  reason: z.string().trim().min(1).max(200),
  nonce: z.uuid(),
});

/**
 * Charges the card the customer paid with, for serious damage or loss (at retail price) or a late return.
 * Re-reads the order here instead of trusting the form, so the card must really be on file for this order.
 * The charge is recorded before Stripe is called and keeps its own idempotency key, so a double submit, a refresh
 * or a network error never charges twice (see src/lib/payments/card-charge.ts).
 */
export async function chargeSavedCard(_previous: CardChargeState, formData: FormData): Promise<CardChargeState> {
  const { supabase } = await requireAdmin();
  // Until the form's charge is recorded, keep its key, so submitting it again is still the same charge
  const nonce = String(formData.get("nonce") ?? "");
  const retry = (message: string): CardChargeState => ({ message, nonce: z.uuid().safeParse(nonce).success ? nonce : randomUUID() });
  if (!stripeEnabled()) return retry("还没有配置 Stripe");

  const parsed = cardChargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return retry("请填写金额和原因");
  const amountCents = parseDollarsToCents(parsed.data.amount);
  if (!amountCents) return retry("金额格式不对，例如 25 或 25.50");
  if (amountCents < 50) return retry("Stripe 最低扣款 $0.50");

  const target = await chargeTarget(supabase, parsed.data.bookingId);
  if (typeof target === "string") return retry(target);
  const outcome = await chargeCard(chargeDeps(), target, amountCents, parsed.data.reason, parsed.data.nonce);
  revalidatePath("/admin");
  if (outcome.status === "busy") return retry(outcome.message);
  // The charge is recorded (whatever its result): the next one gets a new key
  return { message: outcome.message, ok: outcome.status === "succeeded" || outcome.status === "processing", nonce: randomUUID() };
}

/** Retries a charge whose result is unknown, with the same idempotency key (never a second charge) */
export async function retryCardCharge(previous: CardChargeState, formData: FormData): Promise<CardChargeState> {
  const { supabase } = await requireAdmin();
  const done = (message: string, ok = false): CardChargeState => ({ message, ok, nonce: previous.nonce });
  if (!stripeEnabled()) return done("还没有配置 Stripe");
  const chargeId = z.uuid().safeParse(formData.get("chargeId"));
  if (!chargeId.success) return done("找不到这笔扣款");

  const { data: charge, error } = await supabase
    .from("card_charges")
    .select("id, booking_id, amount_cents, reason, status, idempotency_key, created_at, updated_at")
    .eq("id", chargeId.data)
    .maybeSingle();
  if (error) throw new Error(`读取扣款记录失败：${error.message}`);
  if (!charge?.idempotency_key) return done("找不到这笔扣款");

  const target = await chargeTarget(supabase, charge.booking_id);
  if (typeof target === "string") return done(target);
  const outcome = await retryCharge(chargeDeps(), target, {
    id: charge.id,
    bookingId: charge.booking_id,
    amountCents: charge.amount_cents,
    reason: charge.reason,
    status: charge.status,
    idempotencyKey: charge.idempotency_key,
    createdAt: new Date(charge.created_at),
    updatedAt: new Date(charge.updated_at),
  });
  revalidatePath("/admin");
  return done(outcome.message, outcome.status === "succeeded" || outcome.status === "processing");
}

/** The order's saved card, or why it can't be charged */
async function chargeTarget(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  bookingId: string,
): Promise<ChargeTarget | string> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, booking_no, parent_booking_id, stripe_customer_id, stripe_payment_method_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(`读取订单失败：${error.message}`);
  if (!booking || booking.parent_booking_id) return "找不到这个订单";
  if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) return "这单没有留存的卡（不是刷卡付款的订单）";
  return {
    bookingId: booking.id,
    bookingNo: booking.booking_no,
    customerId: booking.stripe_customer_id,
    paymentMethodId: booking.stripe_payment_method_id,
  };
}

/** Charges are written with the service key: admins can only read card_charges directly */
function chargeDeps(): ChargeDeps {
  const service = createSupabaseServiceClient();
  return {
    stripe: getStripe(),
    now: () => new Date(),
    store: {
      async insertPending(target, amountCents, reason, idempotencyKey) {
        const { data, error } = await service
          .from("card_charges")
          .insert({ booking_id: target.bookingId, amount_cents: amountCents, reason, status: "pending", idempotency_key: idempotencyKey })
          .select("id, created_at, updated_at")
          .single();
        // 23505: this form's charge is already recorded (idempotency_key), or the order has another charge
        // whose result isn't known yet (card_charges_one_open_idx)
        if (error?.code === "23505") return error.message.includes("idempotency_key") ? "duplicate" : "busy";
        if (error) throw new Error(`记录扣款失败：${error.message}`);
        return {
          id: data.id,
          bookingId: target.bookingId,
          amountCents,
          reason,
          status: "pending",
          idempotencyKey,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        };
      },
      async setResult(chargeId, result) {
        const { error } = await service
          .from("card_charges")
          .update({
            status: result.status,
            ...(result.intentId !== undefined && { stripe_payment_intent_id: result.intentId }),
            ...(result.failure !== undefined && { failure_message: result.failure }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", chargeId);
        if (error) throw new Error(`保存扣款结果失败：${error.message}`);
      },
    },
  };
}

/** The admin refunded a payment owed back (refund_status "due") in Stripe: record it as refunded */
export async function markRefunded(formData: FormData) {
  await requireAdmin();
  const bookingId = z.uuid().safeParse(formData.get("bookingId"));
  if (!bookingId.success) return;
  const { error } = await createSupabaseServiceClient()
    .from("bookings")
    .update({ refund_status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", bookingId.data)
    .eq("refund_status", "due");
  if (error) throw new Error(`标记已退款失败：${error.message}`);
  revalidatePath("/admin");
}

/** Short-notice shipping order, paid: the owner can ship it in time (confirmed, the customer gets the confirmation email) */
export async function acceptShortNotice(formData: FormData) {
  await requireAdmin();
  const bookingId = z.uuid().safeParse(formData.get("bookingId"));
  if (bookingId.success) await acceptOrder(bookingId.data);
  revalidatePath("/admin");
}

/** Short-notice shipping order the owner can't take: cancelled, the payment marked as a refund due, the customer emailed */
export async function declineShortNotice(formData: FormData) {
  await requireAdmin();
  const bookingId = z.uuid().safeParse(formData.get("bookingId"));
  if (bookingId.success) await declineOrder(bookingId.data);
  revalidatePath("/admin");
}

/**
 * Picked-up order not back yet: set (or clear) the date the admin expects it back. The database holds the piece until then
 * (under the piece's row lock); if that runs into other orders, it lists them and saves only once the admin confirms.
 */
export async function setExpectedReturn(_previous: ReturnDateState, formData: FormData): Promise<ReturnDateState> {
  const { supabase } = await requireAdmin();
  const bookingId = z.uuid().safeParse(formData.get("bookingId"));
  const raw = String(formData.get("date") ?? "").trim();
  const date = z.iso.date().safeParse(raw);
  if (!bookingId.success || (raw && !date.success)) return { message: "日期不对", date: raw };

  const { error } = await supabase.rpc("set_expected_return_date", {
    p_booking_id: bookingId.data,
    p_date: raw ? raw : null,
    p_confirm: Boolean(raw) && formData.get("confirm") === raw,
  });
  if (error) {
    const conflict = /return_conflict (\S+)/.exec(error.message);
    if (conflict) return { conflicts: conflict[1].split(","), date: raw };
    if (error.message.includes("invalid_dates")) return { message: "预计归还日不能早于今天", date: raw };
    if (error.message.includes("not_picked_up")) return { message: "这单已经不是“已取件”状态，请刷新页面" };
    throw new Error(`保存预计归还日失败：${error.message}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/inventory", "layout");
  return { ok: true, message: raw ? "已保存" : "已清除，按逾期规则占用", date: raw };
}

/**
 * Pay-in-person orders: the admin marks the rental as received at pickup (amount = the order total, add-ons and cart items included;
 * a cash deposit is tracked separately in cash_deposit_cents).
 * Only for in-person orders that aren't marked paid yet; written with the service key because admins can only update status and notes directly.
 */
export async function markPaidInPerson(formData: FormData) {
  const { supabase } = await requireAdmin();
  const bookingId = z.uuid().safeParse(formData.get("bookingId"));
  if (!bookingId.success) return;

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, total_cents, payment_method, paid_at, parent_booking_id")
    .eq("id", bookingId.data)
    .maybeSingle();
  if (error) throw new Error(`读取订单失败：${error.message}`);
  const inPerson = booking?.payment_method === "in_person" || booking?.payment_method === "in_person_card";
  if (!booking || booking.parent_booking_id || !inPerson || booking.paid_at) {
    revalidatePath("/admin");
    return;
  }
  const { data: children, error: childError } = await supabase
    .from("bookings")
    .select("total_cents")
    .eq("parent_booking_id", booking.id);
  if (childError) throw new Error(`读取订单明细失败：${childError.message}`);

  const { error: updateError } = await createSupabaseServiceClient()
    .from("bookings")
    .update({
      paid_cents: booking.total_cents + children.reduce((sum, c) => sum + c.total_cents, 0),
      paid_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .is("paid_at", null);
  if (updateError) throw new Error(`标记已收款失败：${updateError.message}`);
  revalidatePath("/admin");
}

/** An order email that failed to send: try once more (it stays listed if it fails again) */
export async function resendOrderEmail(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("emailId"));
  if (id.success) await resendEmail(id.data, await publicOrigin());
  revalidatePath("/admin");
}

/** An order email that failed and is no longer needed (e.g. the customer was told another way): stop listing and retrying it */
export async function dismissOrderEmail(formData: FormData) {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("emailId"));
  if (id.success) {
    const { error } = await createSupabaseServiceClient()
      .from("email_log")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", id.data)
      .eq("status", "failed");
    if (error) throw new Error(`更新邮件记录失败：${error.message}`);
  }
  revalidatePath("/admin");
}
