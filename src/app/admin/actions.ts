"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import type { LoginState } from "@/lib/admin/login-state";
import { canTransition, isBookingStatus } from "@/lib/booking/status";
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
 * 修改订单状态。页面上的按钮只是方便，真正的规则在这里：
 * 重新读取订单现在的状态，只允许合法的下一步，并且只在状态没被别人改过时才更新。
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
    .select("status")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError) throw new Error(`读取订单失败：${readError.message}`);

  // 订单不存在，或页面已经过期（状态已经被改过）：不改，刷新页面显示最新状态
  if (!current || !canTransition(current.status, nextStatus)) {
    revalidatePath("/admin");
    return;
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: nextStatus })
    .eq("id", bookingId)
    .eq("status", current.status);
  if (error) throw new Error(`更新订单状态失败：${error.message}`);

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
