"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { LoginState } from "@/lib/admin/login-state";
import { canTransition, isBookingStatus } from "@/lib/booking/status";
import { notifyOrderConfirmed } from "@/lib/email/order-notifications";
import { publicOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .select("status, parent_booking_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError) throw new Error(`读取订单失败：${readError.message}`);

  // Order missing or the page is stale (status already changed): don't update; refresh to show the latest status
  if (!current || !canTransition(current.status, nextStatus)) {
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
