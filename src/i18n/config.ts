/**
 * 语言设置（浏览器端和服务端都能用）。
 * 中文是默认语言，网址不带前缀（/styles）；英文网址加 /en 前缀（/en/styles）。
 * 内部路由都在 app/[lang] 下，src/proxy.ts 把不带前缀的地址转到 /zh。
 */

export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";

/** <html lang> 和日期格式用的语言代码 */
export const HTML_LANG: Record<Locale, string> = { zh: "zh-CN", en: "en" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 站内路径加上语言前缀："/styles" → 中文 "/styles"，英文 "/en/styles"；"/" → "/en" */
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** 地址栏里的路径 → 语言和去掉前缀后的路径 */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}
