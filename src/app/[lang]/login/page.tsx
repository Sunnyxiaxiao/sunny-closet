import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/account-forms";
import { AuthShell, AuthSkeleton } from "@/components/auth-shell";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCustomer } from "@/lib/account/customer";
import { safeNextPath } from "@/lib/site-url";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).auth.loginTitle, robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const locale = await getLocale();
  const t = getMessages(locale).auth;
  return (
    <AuthShell title={t.loginTitle} subtitle={t.loginSubtitle}>
      <Suspense fallback={<AuthSkeleton />}>
        <LoginBody searchParams={searchParams} locale={locale} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginBody({
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/login">, "searchParams"> & { locale: Locale }) {
  const t = getMessages(locale).auth;
  const query = await searchParams;
  const next = safeNextPath(query.next, localePath(locale, "/account"));
  // 已经登录了就直接去目标页
  if (await getCustomer()) redirect(next);
  return (
    <>
      {query.error === "link" && (
        <p role="alert" className="mb-4 text-sm font-semibold text-red-600">
          {t.errors.linkExpired}
        </p>
      )}
      <LoginForm locale={locale} next={next} />
    </>
  );
}
