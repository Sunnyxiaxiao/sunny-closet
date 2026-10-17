import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { shop } from "@/config/shop";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${shop.name} · 雪服租赁`,
    template: `%s · ${shop.name}`,
  },
  description: shop.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171717",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={shop.locale} className="h-full">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
