import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import { shop } from "@/config/shop";
import "../globals.css";

/** 后台只有中文，有自己的根布局；不让搜索引擎收录 */
export const metadata: Metadata = {
  title: { default: `管理后台 · ${shop.name}`, template: `%s · ${shop.name}` },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171717",
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex min-h-full flex-col">
        <SiteHeader locale="zh" hideLanguageSwitch />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
