import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignupForm } from "@/components/account-forms";
import { AuthShell, AuthSkeleton } from "@/components/auth-shell";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCustomer } from "@/lib/account/customer";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).auth.signupTitle, robots: { index: false } };
}

export default async function SignupPage() {
  const locale = await getLocale();
  const t = getMessages(locale).auth;
  return (
    <AuthShell title={t.signupTitle} subtitle={t.signupSubtitle}>
      <Suspense fallback={<AuthSkeleton />}>
        <SignupBody locale={locale} />
      </Suspense>
    </AuthShell>
  );
}

async function SignupBody({ locale }: { locale: Locale }) {
  if (await getCustomer()) redirect(localePath(locale, "/account"));
  return <SignupForm locale={locale} />;
}
