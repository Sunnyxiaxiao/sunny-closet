import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SnowBackground } from "@/components/snow-background";
import { shop } from "@/config/shop";
import { HTML_LANG, LOCALES } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { SHARE_IMAGE } from "@/lib/seo";
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
    // Each page sets its own canonical / hreflang / link preview (src/lib/seo.ts)
    openGraph: {
      type: "website",
      siteName: shop.name,
      title: `${shop.name} · ${t.siteTitle}`,
      description: t.description,
      images: [SHARE_IMAGE],
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
      </body>
      {/* 访问统计只在顾客页面加载；没配 NEXT_PUBLIC_GA_ID（比如本地开发）就不加载 */}
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
    </html>
  );
}
