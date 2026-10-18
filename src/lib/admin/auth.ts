import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 后台的统一入口：每个后台页面、每个后台操作开头都要调用。
 * 没登录 → 去登录页；登录了但不在管理员名单里 → 也去登录页并提示。
 * 返回的 supabase 客户端带着管理员的登录状态，查询仍然受数据库 RLS 约束。
 */
export async function requireAdmin() {
  // Supabase 校验登录状态时会读当前时间，只能在请求时执行，不能参与预渲染
  await connection();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login?error=forbidden");

  return { supabase, user };
}
