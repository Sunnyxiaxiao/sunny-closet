import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

/**
 * 1. 语言：前台页面都在 app/[lang] 下。中文网址不带前缀（/styles），这里转到内部的 /zh/styles；
 *    英文网址本身就带 /en，原样放行；有人直接打开 /zh/... 时跳回不带前缀的地址，避免同一页两个网址。
 * 2. 登录状态：Supabase 的登录凭证会定期过期，需要在请求进来时续期并写回 cookie，
 *    否则顾客或管理员会莫名其妙被退出登录。只在浏览器带着登录 cookie 时才做，没登录的访客不多一次网络请求。
 *    这里不做权限判断。后台的权限检查在每个后台页面和操作里（见 src/lib/admin/auth.ts）。
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

/** makeResponse 每次调用都要生成新的响应（带上最新的请求 cookie），续期后把新 cookie 写回浏览器 */
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

  // 必须调用 getUser()：它会在需要时续期登录状态
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 跳过接口、Next.js 内部文件和带扩展名的静态文件（图片、favicon 等）
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
