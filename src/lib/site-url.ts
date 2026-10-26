import "server-only";
import { headers } from "next/headers";

/** 当前网站的地址（例如 https://sunnycloset.com），用来生成确认邮件、重设密码邮件里的链接 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * 邮件里用的网站地址：上线后在环境变量 NEXT_PUBLIC_SITE_URL 填正式网址（例如 https://sunnycloset.com），
 * 这样从后台、预览地址触发的邮件也会链接到正式网站；没填时用当前访问的地址。
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured || siteOrigin();
}

/** 只允许跳回本站的路径（防止被拿去跳到别的网站） */
export function safeNextPath(value: unknown, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
