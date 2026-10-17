import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/**
 * 带当前登录状态的服务端客户端（受 RLS 约束）。用于管理后台。
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 在 Server Component 中无法写 cookie；会话刷新由 proxy 负责。
        }
      },
    },
  });
}
