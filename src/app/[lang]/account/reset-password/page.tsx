import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/account-forms";
import { AuthShell, AuthSkeleton } from "@/components/auth-shell";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCustomer } from "@/lib/account/customer";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).auth.resetTitle, robots: { index: false } };
}

/** 从重设密码邮件点进来时已经是登录状态（见 /api/auth/callback），在这里设新密码 */
export default async function ResetPasswordPage() {
  const locale = await getLocale();
  return (
    <AuthShell title={getMessages(locale).auth.resetTitle}>
      <Suspense fallback={<AuthSkeleton />}>
        <ResetBody locale={locale} />
      </Suspense>
    </AuthShell>
  );
}

async function ResetBody({ locale }: { locale: Locale }) {
  if (!(await getCustomer())) redirect(`${localePath(locale, "/login")}?error=link`);
  return <ResetPasswordForm locale={locale} />;
}
