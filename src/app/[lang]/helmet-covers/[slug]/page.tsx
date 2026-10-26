import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingPanel } from "@/components/booking-panel";
import { HelmetCoverCard, TierBadge } from "@/components/helmet-cover-card";
import { HelmetCoverStage } from "@/components/helmet-cover-stage";
import { PriceTierStrip } from "@/components/price-tier-strip";
import { ProductGallery } from "@/components/product-gallery";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import {
  getAvailability,
  getSettings,
  getStyleBySlug,
  getToday,
  listStyles,
  stylePriceTable,
} from "@/lib/catalog";
import { parseDescription } from "@/lib/description";
import { helmetColorTags } from "@/lib/helmet-covers";
import { formatMoney } from "@/lib/money";
import { priceTiers } from "@/lib/pricing";
import { rentalSearchParamsSchema } from "@/lib/validation/rental-query";
import { getMessages } from "@/messages";
import { StyleReviews } from "@/components/style-reviews";

/** 库存里颜色存的是中文名（例如「绿色」），按中文标签名对应库存 */
const ZH_TAGS = getMessages("zh").helmet.tags;

export async function generateMetadata({ params }: PageProps<"/[lang]/helmet-covers/[slug]">): Promise<Metadata> {
  const locale = await getLocale();
  const t = getMessages(locale).helmet;
  const cover = await getStyleBySlug((await params).slug, { kind: "helmet_cover", locale });
  return { title: cover ? t.metaTitle(cover.name) : t.title };
}

export default async function HelmetCoverPage({ params, searchParams }: PageProps<"/[lang]/helmet-covers/[slug]">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl md:px-4 md:py-8">
      <Suspense fallback={<div className="aspect-square animate-pulse bg-neutral-100 md:w-1/2" />}>
        <HelmetCoverDetail params={params} searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function HelmetCoverDetail({
  params,
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/helmet-covers/[slug]">, "params" | "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.helmet;
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const cover = await getStyleBySlug(slug, { kind: "helmet_cover", locale });
  if (!cover) notFound();

  const [settings, today, availability, allCovers] = await Promise.all([
    getSettings(),
    getToday(),
    getAvailability({ styleId: cover.id }),
    listStyles({ kind: "helmet_cover", locale }),
  ]);
  const sizes = availability.get(cover.id) ?? [];
  const prices = stylePriceTable(cover, settings);
  const tiers = priceTiers(prices, settings.maxRentalDays, locale);
  const initial = rentalSearchParamsSchema.parse(raw);
  const related = allCovers.filter((c) => c.id !== cover.id).slice(0, 4);
  const sections = parseDescription(cover.description);
  const stockBySize = new Map(sizes.map((item) => [item.size, item]));
  const colors = helmetColorTags(cover.tags).flatMap((tag, index) => {
    const label = ZH_TAGS[tag] ?? tag;
    const stock = stockBySize.get(label);
    if (!stock || !cover.image_urls[index + 1]) return [];
    return [{ label, imageIndex: index + 1, stock }];
  });
  const colorTagSet = new Set(helmetColorTags(cover.tags));
  const shownTags = colors.length > 0 ? cover.tags.filter((tag) => !colorTagSet.has(tag)) : cover.tags;

  const info = (
    <>
      <nav className="text-xs text-neutral-500">
        <Link href={localePath(locale, "/helmet-covers")} className="hover:underline">
          {t.title}
        </Link>
      </nav>
      <div className="mt-3 flex items-center gap-2">
        {cover.tier && <TierBadge tier={cover.tier} locale={locale} />}
      </div>
      <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">{cover.name}</h1>

      {shownTags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {shownTags.map((tag) => (
            <li key={tag} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
              #{t.tags[tag] ?? tag}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {t.standalonePricing}
      </h2>
      <div className="mt-2">
        <PriceTierStrip tiers={tiers} locale={locale} />
      </div>

      {cover.addon_price_cents !== null && (
        <Link
          href={localePath(locale, `/styles?${new URLSearchParams({ addon: cover.slug })}`)}
          className="mt-3 block bg-rose-50 px-4 py-3 text-rose-900 transition hover:bg-rose-100"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-xs">{t.addOnPricing}</span>
            <span className="text-lg font-bold">+{formatMoney(cover.addon_price_cents, { whole: true })}</span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-3 text-xs">
            <span>{t.addOnPricingBody}</span>
            <span className="shrink-0 text-sm font-semibold">{t.addOnCta} →</span>
          </span>
        </Link>
      )}

      <p className="mt-4 border-l-2 border-neutral-900 pl-3 text-xs leading-relaxed text-neutral-600">
        {t.notice}
      </p>
      {cover.replacement_value_cents !== null && (
        <p className="mt-2 text-xs text-neutral-500">
          {t.replacementValue}
          {formatMoney(cover.replacement_value_cents, { whole: true })}
        </p>
      )}
    </>
  );

  const description = sections.some((s) => s.blocks.length > 0) ? (
    <div className="mt-8 space-y-3 border-t border-neutral-200 pt-6 text-sm leading-relaxed text-neutral-700">
      {sections.map((section, index) => (
        <div key={index}>
          {section.title && <h2 className="font-semibold text-neutral-900">{section.title}</h2>}
          {section.blocks.map((block, i) =>
            block.type === "list" ? (
              <ul key={i} className="mt-1 list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="mt-1 whitespace-pre-line">
                {block.text}
              </p>
            ),
          )}
        </div>
      ))}
    </div>
  ) : null;

  const booking =
    sizes.length === 0 ? (
      <p className="text-neutral-500">{t.notRentable}</p>
    ) : (
      <BookingPanel
        styleId={cover.id}
        rentalPricesCents={prices}
        shippingMinDays={settings.shippingMinDays}
        depositCents={cover.deposit_cents}
        sizes={sizes}
        today={today}
        maxRentalDays={settings.maxRentalDays}
        paddings={settings.paddings}
        initial={initial}
        hideSize
        locale={locale}
      />
    );

  return (
    <>
      {colors.length > 0 ? (
        <HelmetCoverStage
          images={cover.image_urls}
          alt={cover.name}
          imageIndexBySize={Object.fromEntries(colors.map((color) => [color.label, color.imageIndex]))}
          before={info}
          after={description}
          choiceLabel={t.colorLabel}
          panel={{
            styleId: cover.id,
            rentalPricesCents: prices,
            shippingMinDays: settings.shippingMinDays,
            depositCents: cover.deposit_cents,
            sizes: colors.map((color) => color.stock),
            today,
            maxRentalDays: settings.maxRentalDays,
            paddings: settings.paddings,
            initial,
            locale,
          }}
        />
      ) : (
        <div className="md:grid md:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.78fr)] md:gap-8">
          <ProductGallery images={cover.image_urls} alt={cover.name} aspect="helmet" locale={locale} />
          <div className="px-4 pt-5 md:sticky md:top-24 md:self-start md:px-0 md:pt-0">
            {info}
            <div className="mt-6 border-t border-neutral-200 pt-6">{booking}</div>
            {description}
          </div>
        </div>
      )}

      <StyleReviews styleId={cover.id} locale={locale} />

      {related.length > 0 && (
        <section className="px-2 pt-14 md:px-0">
          <h2 className="px-2 text-xl font-black md:px-0">{messages.product.related}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-4 sm:gap-x-4">
            {related.map((c) => (
              <li key={c.id}>
                <HelmetCoverCard cover={c} sizes="(min-width: 640px) 25vw, 50vw" locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
