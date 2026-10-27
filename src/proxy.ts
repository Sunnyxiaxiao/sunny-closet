import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

/**
 * 1. Locale: storefront pages live under app/[lang]. Chinese URLs have no prefix (/styles) and are rewritten here to the internal /zh/styles;
 *    English URLs already carry /en and pass through; direct visits to /zh/... redirect to the unprefixed URL so a page never has two URLs.
 * 2. Session: Supabase auth tokens expire periodically and must be refreshed on incoming requests and written back to cookies,
 *    or customers and the admin get signed out unexpectedly. Only done when the browser has an auth cookie, so signed-out visitors cost no extra request.
 *    No authorization happens here. Admin access is checked in every admin page and action (see src/lib/admin/auth.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return refreshSession(request, () => NextResponse.next({ request }));
  }

  const prefixed = LOCALES.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (prefixed === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (prefixed) return refreshSession(request, () => NextResponse.next({ request }));

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return refreshSession(request, () => NextResponse.rewrite(url, { request }));
}

function hasAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/** makeResponse must build a fresh response on every call (with the latest request cookies), so refreshed cookies get written back to the browser */
async function refreshSession(request: NextRequest, makeResponse: () => NextResponse) {
  let response = makeResponse();
  if (!hasAuthCookie(request)) return response;

  const { url, publishableKey } = getPublicSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() must be called: it refreshes the session when needed
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip API routes, Next.js internals and static files with an extension (images, favicon, etc.)
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
