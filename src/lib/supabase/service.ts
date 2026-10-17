import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv, getSecretKey } from "./env";

/**
 * 使用 Secret Key 的服务端客户端，会绕过 RLS。
 * 只用于“提交预订”和“频率限制”这类必须由服务端代为执行的操作，绝不能在浏览器端使用。
 */
export function createSupabaseServiceClient() {
  const { url } = getPublicSupabaseEnv();
  return createClient<Database>(url, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
