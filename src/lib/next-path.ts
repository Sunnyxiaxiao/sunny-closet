// Any origin works: it only anchors relative paths so the result can be compared against it
const BASE = "https://site.invalid";

/**
 * Only allow redirects to paths on this site (prevents open redirects to other sites).
 * Browsers treat "\" like "/" and drop tabs / newlines, so "/\evil.com" would leave the site:
 * those are refused, and the path is resolved to make sure it stays on this origin.
 */
export function safeNextPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
