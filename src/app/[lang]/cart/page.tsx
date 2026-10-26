import type { Metadata } from "next";
import { Suspense } from "react";
import { CartView } from "@/components/cart-view";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { checkoutDefaults, getCustomer } from "@/lib/account/customer";
import { getSettings } from "@/lib/catalog";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getMessages(await getLocale()).cart.metaTitle,
    robots: { index: false, follow: false },
  };
}

/** 购物车：放进来的几件一起结算，一个预订编号 */
export default async function CartPage() {
  const locale = await getLocale();
  const t = getMessages(locale).cart;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">{t.title}</h1>
      <Suspense fallback={<p className="mt-8 text-neutral-500">{t.loading}</p>}>
        <Cart locale={locale} />
      </Suspense>
    </div>
  );
}

async function Cart({ locale }: { locale: Locale }) {
  const [settings, customer] = await Promise.all([getSettings(), getCustomer()]);
  return <CartView locale={locale} shippingMinDays={settings.shippingMinDays} defaults={checkoutDefaults(customer)} />;
}
