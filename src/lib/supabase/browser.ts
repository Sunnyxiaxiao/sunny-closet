"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/** Browser client (subject to RLS). Used for admin sign-in and image uploads. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
