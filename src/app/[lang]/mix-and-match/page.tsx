import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductCard, ProductGridSkeleton } from "@/components/product-card";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import {
  getAvailability,
  getSettings,
  listStyles,
  crystalRegularTable,
  stylePriceTable,
  type PublicStyle,
  type ShopSettings,
  type SizeAvailability,
} from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { rentalPriceCents } from "@/lib/pricing";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).mixMatch.title };
}

/** Mix & Match：外套、雪裤单租，配一张单租 / 成套的价格对照表 */
export default async function MixAndMatchPage() {
  const locale = await getLocale();
  const t = getMessages(locale).mixMatch;
  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12">
      <div className="px-2 sm:px-0">
        <h1 className="text-3xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.subtitle}</p>
      </div>
      <Suspense fallback={<ProductGridSkeleton count={4} />}>
        <MixAndMatch locale={locale} />
      </Suspense>
    </div>
  );
}

async function MixAndMatch({ locale }: { locale: Locale }) {
  const t = getMessages(locale).mixMatch;
  const [styles, availability, settings] = await Promise.all([listStyles({ locale }), getAvailability(), getSettings()]);
  const jackets = styles.filter((s) => s.category === "jacket");
  const pants = styles.filter((s) => s.category === "pants");

  return (
    <>
      <PriceTable settings={settings} locale={locale} />
      <Section title={t.jacketsTitle} empty={t.jacketsEmpty} styles={jackets} {...{ availability, settings, locale }} />
      <Section title={t.pantsTitle} empty={t.pantsEmpty} styles={pants} {...{ availability, settings, locale }} />
    </>
  );
}

function PriceTable({ settings, locale }: { settings: ShopSettings; locale: Locale }) {
  const t = getMessages(locale).mixMatch;
  const days = Array.from({ length: settings.maxRentalDays }, (_, i) => i + 1);
  const money = (prices: number[], day: number) => formatMoney(rentalPriceCents(prices, day), { whole: true });
  return (
    <section className="mx-2 mt-6 sm:mx-0">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{t.tableTitle}</h2>
      <table className="mt-2 w-full border border-neutral-200 text-center text-sm tabular-nums sm:max-w-2xl">
        <thead className="bg-neutral-50 text-xs text-neutral-500">
          <tr>
            <th className="px-2 py-2.5 text-left font-medium">{t.days}</th>
            <th className="px-2 py-2.5 font-medium">{t.jacket}</th>
            <th className="px-2 py-2.5 font-medium">{t.pants}</th>
            <th className="px-2 py-2.5 font-medium">{t.suit}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {days.map((day) => (
            <tr key={day}>
              <td className="px-2 py-2 text-left text-neutral-500">{t.dayCount(day)}</td>
              <td className="px-2 py-2 font-semibold">{money(settings.jacketPricesCents, day)}</td>
              <td className="px-2 py-2 font-semibold">{money(settings.pantsPricesCents, day)}</td>
              <td className="px-2 py-2 text-neutral-500">{money(settings.rentalPricesCents, day)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">{t.tableNote}</p>
      <p className="mt-1 text-xs text-neutral-500">{t.specialNote}</p>
      <p className="mt-1 text-xs text-neutral-500">{t.depositNote}</p>
    </section>
  );
}

function Section({
  title,
  empty,
  styles,
  availability,
  settings,
  locale,
}: {
  title: string;
  empty: string;
  styles: PublicStyle[];
  availability: Map<string, SizeAvailability[]>;
  settings: ShopSettings;
  locale: Locale;
}) {
  return (
    <section className="mt-10">
      <h2 className="px-2 text-2xl font-black sm:px-0">{title}</h2>
      {styles.length === 0 ? (
        <p className="mx-2 mt-4 border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 sm:mx-0">
          {empty}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {styles.map((style) => (
            <li key={style.id}>
              <ProductCard
                style={style}
                sizes={(availability.get(style.id) ?? []).map((s) => s.size)}
                fromCents={stylePriceTable(style, settings)[0]}
                wasCents={crystalRegularTable(style, settings)?.[0]}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
