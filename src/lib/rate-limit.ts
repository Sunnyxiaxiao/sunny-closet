import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The visitor's IP address as the host passes it on ("unknown" if it doesn't) */
export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown"
  );
}

/**
 * Records one request and says whether it is within `limit` per `windowSeconds` for this key (rate_limits table,
 * hit_rate_limit(); keys are stored hashed). null when the check itself failed.
 */
export async function hitRateLimit(bucket: string, key: string, limit: number, windowSeconds: number): Promise<boolean | null> {
  const { data, error } = await createSupabaseServiceClient().rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_key_hash: createHash("sha256").update(key).digest("hex"),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[rate-limit] ${bucket} 检查失败`, error);
    return null;
  }
  return data;
}
