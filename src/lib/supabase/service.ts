import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv, getSecretKey } from "./env";

/**
 * Server-side client using the secret key; bypasses RLS.
 * Only for operations the server must perform on someone's behalf, such as placing orders and rate limiting. Never use it in the browser.
 */
export function createSupabaseServiceClient() {
  const { url } = getPublicSupabaseEnv();
  return createClient<Database>(url, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
