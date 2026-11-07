import "server-only";
import { headers } from "next/headers";

/** The origin the request came in on (local development only: request headers can be forged, so never for production links) */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * The site's origin for links in emails (sign-up confirmation, password reset, orders), the sitemap and robots.txt:
 * NEXT_PUBLIC_SITE_URL (e.g. https://sssunnycloset.com). Production refuses to run without it rather than trust the request's
 * Host / X-Forwarded-Host headers, which anyone can set; in development it falls back to the request's origin.
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set: production links can't be built from request headers");
  }
  return requestOrigin();
}

export { safeNextPath } from "@/lib/next-path";
