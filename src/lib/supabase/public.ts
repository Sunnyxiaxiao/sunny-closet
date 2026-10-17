import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/**
 * 匿名身份的服务端客户端（不读 cookie，受 RLS 约束）。用于前台读取商品与可用性。
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
