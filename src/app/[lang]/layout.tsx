import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SnowBackground } from "@/components/snow-background";
import { shop } from "@/config/shop";
import { HTML_LANG, LOCALES, localePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getMessages(locale).meta;
  return {
    // 分享链接、网站地图里的完整网址用正式域名（环境变量 NEXT_PUBLIC_SITE_URL）
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
    title: {
      default: `${shop.name} · ${t.siteTitle}`,
      template: `%s · ${shop.name}`,
    },
    description: t.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], localePath(l, "/")])),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171717",
};

export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className="h-full">
      <body className="flex min-h-full flex-col">
        <SnowBackground />
        <SiteHeader locale={locale} />
        <main className="flex-1">{children}</main>
        <SiteFooter locale={locale} />
        {/* Vercel 网站流量统计（不用 cookie）：部署到 Vercel 并在项目里打开 Analytics 后生效，本地开发不统计。后台页面不统计 */}
        <Analytics />
      </body>
    </html>
  );
}
