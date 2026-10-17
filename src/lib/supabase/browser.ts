"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/** 浏览器端客户端（受 RLS 约束）。用于管理员登录、上传图片。 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
