import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./env";

/**
 * Anonymous server-side client (doesn't read cookies, subject to RLS). Used by the storefront to read products and availability.
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
