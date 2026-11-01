"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { CardChargeState } from "@/lib/admin/card-charge-state";
import type { LoginState } from "@/lib/admin/login-state";
import { parseDollarsToCents } from "@/lib/booking/card-payment";
import { canTransition, isBookingStatus } from "@/lib/booking/status";
import { notifyOrderConfirmed } from "@/lib/email/order-notifications";
import { formatMoney } from "@/lib/money";
import { publicOrigin } from "@/lib/site-url";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import type { CardChargeStatus } from "@/lib/supabase/database.types";
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
    .select("status, parent_booking_id, payment_method")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError) throw new Error(`读取订单失败：${readError.message}`);

  // Order missing or the page is stale (status already changed): don't update; refresh to show the latest status
  if (!current || !canTransition(current.status, nextStatus, current.payment_method)) {
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
 * The nonce is sent to Stripe as the idempotency key, so a double submit doesn't charge twice.
 * Every attempt is recorded in card_charges, failed ones included, so the order card shows what happened.
 */
export async function chargeSavedCard(_previous: CardChargeState, formData: FormData): Promise<CardChargeState> {
  const { supabase } = await requireAdmin();
  // Every finished attempt gets a fresh key: Stripe replays the stored result (even a decline) for a key it has seen
  const next = (message: string, ok = false): CardChargeState => ({ message, ok, nonce: randomUUID() });
  if (!stripeEnabled()) return next("还没有配置 Stripe");

  const parsed = cardChargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return next("请填写金额和原因");
  const amountCents = parseDollarsToCents(parsed.data.amount);
  if (!amountCents) return next("金额格式不对，例如 25 或 25.50");
  if (amountCents < 50) return next("Stripe 最低扣款 $0.50");

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, booking_no, parent_booking_id, stripe_customer_id, stripe_payment_method_id")
    .eq("id", parsed.data.bookingId)
    .maybeSingle();
  if (error) throw new Error(`读取订单失败：${error.message}`);
  if (!booking || booking.parent_booking_id) return next("找不到这个订单");
  if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) return next("这单没有留存的卡（不是刷卡付款的订单）");

  const service = createSupabaseServiceClient();
  const record = async (row: { status: CardChargeStatus; intentId: string | null; failure?: string }) => {
    const { error: insertError } = await service.from("card_charges").insert({
      booking_id: booking.id,
      amount_cents: amountCents,
      reason: parsed.data.reason,
      status: row.status,
      stripe_payment_intent_id: row.intentId,
      failure_message: row.failure ?? null,
    });
    // 23505: the same attempt was already recorded (double submit with the same idempotency key)
    if (insertError && insertError.code !== "23505") console.error("[chargeDepositCard] 记录扣款失败", insertError);
  };

  let message: string;
  let ok = false;
  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: booking.stripe_customer_id,
        payment_method: booking.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `${booking.booking_no} · ${parsed.data.reason}`,
        metadata: { booking_id: booking.id, booking_no: booking.booking_no },
      },
      { idempotencyKey: parsed.data.nonce },
    );
    if (intent.status === "succeeded") {
      await record({ status: "succeeded", intentId: intent.id });
      ok = true;
      message = `已扣款 ${formatMoney(amountCents)}`;
    } else if (intent.status === "processing") {
      await record({ status: "processing", intentId: intent.id });
      ok = true;
      message = "扣款处理中，结果出来后会自动更新";
    } else {
      // e.g. requires_action: the bank wants the customer to verify, which can't happen while they're not on the site
      await record({ status: "failed", intentId: intent.id, failure: `需要顾客验证（${intent.status}）` });
      message = "银行要求顾客本人验证，没法直接扣款，请联系顾客付款";
    }
  } catch (stripeError) {
    const err = stripeError instanceof Stripe.errors.StripeError ? stripeError : null;
    await record({ status: "failed", intentId: err?.payment_intent?.id ?? null, failure: err?.message ?? "Unknown error" });
    message = `扣款失败：${err?.message ?? "未知错误"}`;
  }

  revalidatePath("/admin");
  return next(message, ok);
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
