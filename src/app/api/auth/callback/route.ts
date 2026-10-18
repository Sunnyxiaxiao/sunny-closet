import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * 确认邮件、重设密码邮件里的链接会跳到这里，验证通过后写入登录状态（cookie），再跳到 next：
 * - ?token_hash=...&type=recovery&next=/account/reset-password（推荐：邮件模板里用 {{ .TokenHash }}，换手机、换浏览器打开也能用）
 * - ?code=...&next=/account（Supabase 默认模板；只能在发起注册 / 重设的同一个浏览器里打开）
 * 链接失效时跳回登录页并提示。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/account");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await createSupabaseServerClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("[auth/callback] 验证邮件链接失败", error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("[auth/callback] 换取登录状态失败", error);
  }

  // next 以 /en 开头时回英文登录页
  const login = next.startsWith("/en/") || next === "/en" ? "/en/login" : "/login";
  return NextResponse.redirect(new URL(`${login}?error=link`, origin));
}
