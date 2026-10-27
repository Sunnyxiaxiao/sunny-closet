import "server-only";
import { headers } from "next/headers";

/** The current site origin (e.g. https://sunnycloset.com), used to build links in confirmation and password-reset emails */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Site origin for emails: after launch, set NEXT_PUBLIC_SITE_URL to the production URL (e.g. https://sunnycloset.com)
 * so emails triggered from admin or preview deployments still link to the production site; falls back to the current origin when unset.
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured || siteOrigin();
}

/** Only allow redirects to paths on this site (prevents open redirects to other sites) */
export function safeNextPath(value: unknown, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
