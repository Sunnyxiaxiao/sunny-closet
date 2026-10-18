"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import { HTML_LANG, localePath, splitLocalePath, type Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

const otherLocale = (locale: Locale): Locale => (locale === "zh" ? "en" : "zh");

/** 右上角的中 / EN 切换：换到另一种语言的同一页，保留日期、尺码等查询参数 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  // 读当前地址要等到浏览器端；在那之前先显示一个指向另一种语言首页的按钮
  return (
    <Suspense fallback={<SwitchLink locale={locale} href={localePath(otherLocale(locale), "/")} />}>
      <CurrentPageSwitch locale={locale} />
    </Suspense>
  );
}

function CurrentPageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  const target = localePath(otherLocale(locale), splitLocalePath(pathname).path);
  return (
    <SwitchLink
      locale={locale}
      href={target}
      onClick={(event) => {
        // 带上当前的查询参数（日期、尺码……），不用 useSearchParams 以免整块变成动态渲染
        if (!window.location.search) return;
        event.preventDefault();
        router.push(`${target}${window.location.search}`);
      }}
    />
  );
}

function SwitchLink({
  locale,
  href,
  onClick,
}: {
  locale: Locale;
  href: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const t = getMessages(locale).nav;
  return (
    <Link
      href={href}
      hrefLang={HTML_LANG[otherLocale(locale)]}
      aria-label={t.switchLanguageLabel}
      onClick={onClick}
      className="whitespace-nowrap rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-bold tracking-wider hover:border-neutral-900"
    >
      {t.switchLanguage}
    </Link>
  );
}
