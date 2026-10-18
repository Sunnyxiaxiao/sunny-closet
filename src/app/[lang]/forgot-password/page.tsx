import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account-forms";
import { AuthShell } from "@/components/auth-shell";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).auth.forgotTitle, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const t = getMessages(locale).auth;
  return (
    <AuthShell title={t.forgotTitle} subtitle={t.forgotSubtitle}>
      <ForgotPasswordForm locale={locale} />
    </AuthShell>
  );
}
