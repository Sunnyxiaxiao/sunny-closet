"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "@/i18n/config";
import type { AccountFormState } from "@/lib/account/form-state";
import { safeNextPath, siteOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages } from "@/messages";

/**
 * 顾客账号：注册、登录、退出、重设密码、保存联系方式。
 * 登录状态存在 Supabase 的 cookie 里；管理员也是同一套账号，是否有后台权限另看 admin_users 名单。
 */

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function localeOf(formData: FormData): Locale {
  const value = formData.get("locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Supabase 的报错 → 给顾客看的提示 */
function authError(locale: Locale, error: { code?: string; message: string; status?: number }) {
  const t = getMessages(locale).auth.errors;
  const code = error.code ?? "";
  if (code === "invalid_credentials") return t.invalidCredentials;
  if (code === "email_not_confirmed") return t.emailNotConfirmed;
  if (code === "user_already_exists" || code === "email_exists") return t.emailTaken;
  if (code === "weak_password") return t.weakPassword;
  if (code === "email_address_invalid" || code === "validation_failed") return t.invalidEmail;
  if (code.includes("rate_limit") || error.status === 429) return t.rateLimited;
  console.error("[account] Supabase 登录服务报错", error);
  return t.generic;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpCustomer(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const locale = localeOf(formData);
  const t = getMessages(locale).auth;
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { name, email };

  if (!name || !email || !password) return { message: t.errors.required, values };
  if (name.length > 60) return { fieldErrors: { name: getMessages(locale).account.nameTooLong }, values };
  if (!EMAIL_RE.test(email)) return { fieldErrors: { email: t.errors.invalidEmail }, values };
  if (password.length < 8) return { fieldErrors: { password: t.errors.weakPassword }, values };

  const supabase = await createSupabaseServerClient();
  const accountPath = localePath(locale, "/account");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${await siteOrigin()}/api/auth/callback?next=${encodeURIComponent(accountPath)}`,
    },
  });
  if (error) return { message: authError(locale, error), values };

  // 邮箱已注册时 Supabase 不报错，但返回的用户没有身份信息
  if (data.user && data.user.identities?.length === 0) return { message: t.errors.emailTaken, values };

  if (data.user) {
    const { error: profileError } = await createSupabaseServiceClient()
      .from("profiles")
      .upsert({ user_id: data.user.id, full_name: name }, { onConflict: "user_id" });
    if (profileError) console.error("[signUpCustomer] 保存资料失败", profileError);
  }

  // 不需要确认邮箱时直接登录了；需要确认时提示去收邮件
  if (data.session) redirect(accountPath);
  return { notice: t.checkEmail(email), values };
}

export async function signInCustomer(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const locale = localeOf(formData);
  const t = getMessages(locale).auth;
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { message: t.errors.required, values: { email } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: authError(locale, error), values: { email } };

  redirect(safeNextPath(formData.get("next"), localePath(locale, "/account")));
}

export async function signOutCustomer(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(localePath(localeOf(formData), "/"));
}

export async function requestPasswordReset(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const locale = localeOf(formData);
  const t = getMessages(locale).auth;
  const email = str(formData, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { fieldErrors: { email: t.errors.invalidEmail }, values: { email } };

  const supabase = await createSupabaseServerClient();
  const next = localePath(locale, "/account/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/api/auth/callback?next=${encodeURIComponent(next)}`,
  });
  // 不告诉对方这个邮箱有没有注册过；只有发送太频繁时提示
  if (error && (error.status === 429 || error.code?.includes("rate_limit"))) {
    return { message: t.errors.rateLimited, values: { email } };
  }
  if (error) console.error("[requestPasswordReset] 发送失败", error);
  return { notice: t.resetSent(email), values: { email } };
}

export async function updatePassword(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const locale = localeOf(formData);
  const t = getMessages(locale).auth;
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { fieldErrors: { password: t.errors.weakPassword } };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { message: authError(locale, error) };
  redirect(`${localePath(locale, "/account")}?password=updated`);
}

const PHONE_RE = /^[0-9+()\-.\s]{7,25}$/;

export async function saveProfile(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const locale = localeOf(formData);
  const t = getMessages(locale).account;
  const values = { name: str(formData, "name"), phone: str(formData, "phone"), wechat: str(formData, "wechat") };
  const parsed = z
    .object({
      name: z.string().max(60, t.nameTooLong),
      phone: z.union([z.literal(""), z.string().regex(PHONE_RE, t.phoneInvalid)]),
      wechat: z.string().max(60, t.wechatTooLong),
    })
    .safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(localePath(locale, "/login"));

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      full_name: parsed.data.name,
      phone: parsed.data.phone,
      wechat: parsed.data.wechat,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[saveProfile] 保存失败", error);
    return { message: getMessages(locale).auth.errors.generic, values };
  }
  return { notice: t.saved, values };
}
