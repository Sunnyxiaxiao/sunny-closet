import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Customer {
  user: User;
  profile: Pick<ProfileRow, "full_name" | "phone" | "wechat">;
}

/** 浏览器里有没有 Supabase 的登录 cookie（没有就不用去问 Supabase，省一次网络请求） */
export async function hasAuthCookie() {
  return (await cookies()).getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/** 当前登录的顾客和他的资料；没登录返回 null。读 cookie，所以只能放在 Suspense 里 */
export async function getCustomer(): Promise<Customer | null> {
  if (!(await hasAuthCookie())) return null;
  // Supabase 校验登录状态时会读当前时间，只能在请求时执行，不能参与预渲染
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone, wechat")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    user,
    profile: data ?? { full_name: String(user.user_metadata?.full_name ?? ""), phone: "", wechat: "" },
  };
}

/** 下单表单预先填好的内容 */
export function checkoutDefaults(customer: Customer | null) {
  if (!customer) return undefined;
  return {
    name: customer.profile.full_name,
    email: customer.user.email ?? "",
    phone: customer.profile.phone,
    wechat: customer.profile.wechat,
  };
}
