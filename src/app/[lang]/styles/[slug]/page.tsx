import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BookingPanel } from "@/components/booking-panel";
import { ProductCard } from "@/components/product-card";
import { PriceTierStrip } from "@/components/price-tier-strip";
import { ProductGallery } from "@/components/product-gallery";
import { RentFrom } from "@/components/rent-from";
import { StyleImage } from "@/components/style-image";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import {
  availableCounts,
  getAvailability,
  getSettings,
  getStyleBySlug,
  getToday,
  isSeparate,
  listStyles,
  sameSeries,
  crystalRegularTable,
  stylePriceTable,
  WITH_PANTS_TAG,
} from "@/lib/catalog";
import { parseDescription, type DescriptionBlock } from "@/lib/description";
import type { AddOnOption } from "@/lib/helmet-covers";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { priceTiers } from "@/lib/pricing";
import { shippingPolicyArgs } from "@/lib/shipping";
import { rentalSearchParamsSchema } from "@/lib/validation/rental-query";
import { getMessages, sizeLabel } from "@/messages";
import { StyleReviews } from "@/components/style-reviews";

export async function generateMetadata({ params }: PageProps<"/[lang]/styles/[slug]">): Promise<Metadata> {
  const locale = await getLocale();
  const style = await getStyleBySlug((await params).slug, { locale });
  return { title: style?.name ?? getMessages(locale).styles.title };
}

export default async function StyleDetailPage({ params, searchParams }: PageProps<"/[lang]/styles/[slug]">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl md:px-4 md:py-8">
      <Suspense fallback={<DetailSkeleton />}>
        <StyleDetail params={params} searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function StyleDetail({
  params,
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/styles/[slug]">, "params" | "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.product;
  const href = (path: string) => localePath(locale, path);
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const style = await getStyleBySlug(slug, { locale });
  if (!style) notFound();
  // “上衣 + 黑色雪裤”是上衣页面里的选项，没有自己的页面
  if (style.tags.includes(WITH_PANTS_TAG) && style.bundle_style_ids) {
    const jacket = (await listStyles({ locale })).find((s) => s.id === style.bundle_style_ids?.[0]);
    if (jacket) permanentRedirect(href(`/styles/${jacket.slug}`));
    notFound();
  }

  const [settings, today, availability, allStyles, helmetCovers] = await Promise.all([
    getSettings(),
    getToday(),
    getAvailability(),
    listStyles({ locale, withPantsOptions: true }),
    listStyles({ kind: "helmet_cover", locale }),
  ]);
  const sizes = availability.get(style.id) ?? [];
  const initial = rentalSearchParamsSchema.parse(raw);
  const addonSlug = typeof raw.addon === "string" ? raw.addon : undefined;
  // 有库存的头盔套才放进“Complete the Look”；从头盔套页过来的那顶排在最前面
  const inStock = availableCounts(availability);
  const addOnOptions: AddOnOption[] = helmetCovers
    .flatMap((c) =>
      c.tier && c.addon_price_cents !== null && (inStock.get(c.id) ?? 0) > 0
        ? [{ id: c.id, slug: c.slug, name: c.name, imageUrl: c.image_urls[0], tier: c.tier, addOnCents: c.addon_price_cents }]
        : [],
    )
    .sort((a, b) => Number(b.slug === addonSlug) - Number(a.slug === addonSlug));
  const prices = stylePriceTable(style, settings);
  const regularPrices = crystalRegularTable(style, settings);
  const tiers = priceTiers(prices, settings.maxRentalDays, locale);
  // 组合套装：由哪几件单品组成；单品：属于哪几个组合套装
  const parts = (style.bundle_style_ids ?? []).flatMap((id) => allStyles.find((s) => s.id === id) ?? []);
  const containing = allStyles.filter((s) => s.bundle_style_ids?.includes(style.id));
  const sets = containing.filter((s) => !s.tags.includes(WITH_PANTS_TAG));
  const pantsSet = containing.find((s) => s.tags.includes(WITH_PANTS_TAG));
  const pantsOption = pantsSet && {
    styleId: pantsSet.id,
    rentalPricesCents: stylePriceTable(pantsSet, settings),
    depositCents: pantsSet.deposit_cents,
  };
  const variants = sameSeries(style, allStyles);
  const related = allStyles
    .filter((s) => s.id !== style.id)
    .sort((a, b) => Number(b.category === style.category) - Number(a.category === style.category))
    .slice(0, 4);

  return (
    <>
      <div className="md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12">
        <ProductGallery images={style.image_urls} alt={style.name} locale={locale} />

        <div className="px-4 pt-5 md:sticky md:top-24 md:self-start md:px-0 md:pt-0">
          <nav className="text-xs text-neutral-500">
            <Link href={href("/styles")} className="hover:underline">
              {messages.nav.styles}
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={href(`/styles?category=${style.category}`)} className="hover:underline">
              {messages.categories[style.category]}
            </Link>
          </nav>
          {style.brand && (
            <Link
              href={href(`/styles?${new URLSearchParams({ brand: style.brand })}`)}
              className="mt-3 block text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
            >
              {style.brand}
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-bold leading-snug sm:text-3xl">{style.name}</h1>
          <p className="mt-3 text-xl">
            <RentFrom
              cents={prices[0]}
              wasCents={regularPrices?.[0]}
              locale={locale}
              priceClassName="font-bold"
            />
          </p>
          <div className="mt-4">
            <PriceTierStrip tiers={tiers} showPerDay regularPrices={regularPrices} locale={locale} />
          </div>
          {regularPrices && settings.crystalPromoEndsOn && (
            <p className="mt-2 text-xs font-semibold text-rose-600">
              {t.promoNote(formatDate(settings.crystalPromoEndsOn, locale))}
            </p>
          )}
          {variants.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{t.otherColors}</p>
              <ul className="mt-2 flex flex-wrap gap-3">
                {variants.map((v) => (
                  <li key={v.id}>
                    <Link href={href(`/styles/${v.slug}`)} className="group flex w-56 items-center gap-3 border border-neutral-200 p-2 hover:border-neutral-900">
                      <div className="w-12 shrink-0">
                        <StyleImage src={v.image_urls[0]} alt="" sizes="48px" thumb />
                      </div>
                      <div className="min-w-0 text-xs">
                        <p className="font-semibold leading-snug">{v.name}</p>
                        <p className="mt-0.5 text-neutral-500">
                          {t.variantNote(
                            messages.categories[v.category],
                            (availability.get(v.id) ?? []).map((x) => sizeLabel(x.size, locale)).join(" / "),
                          )}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parts.length > 0 && (
            <div className="mt-3 bg-neutral-100 px-4 py-3 text-sm">
              <p className="font-semibold">{t.styledTitle}</p>
              <p className="mt-1 text-neutral-600">{t.styledBody}</p>
              <ul className="mt-2 space-y-1">
                {parts.map((part) => (
                  <li key={part.id}>
                    <Link href={href(`/styles/${part.slug}`)} className="font-semibold underline underline-offset-4">
                      {part.name} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sets.map((set) => (
            <Link
              key={set.id}
              href={href(`/styles/${set.slug}`)}
              className="mt-3 flex items-center justify-between gap-3 bg-neutral-100 px-4 py-3 text-sm hover:bg-neutral-200"
            >
              <span>{t.inSet(set.name)}</span>
              <span className="shrink-0 font-semibold">{t.inSetCta}</span>
            </Link>
          ))}
          {isSeparate(style) && (
            <Link
              href={href("/mix-and-match")}
              className="mt-3 flex items-center justify-between gap-3 bg-neutral-100 px-4 py-3 text-sm hover:bg-neutral-200"
            >
              <span>{messages.mixMatch.detailNote}</span>
              <span className="shrink-0 font-semibold">{messages.mixMatch.detailCta}</span>
            </Link>
          )}
          <p className="mt-2 text-sm text-neutral-500">
            {t.pickupMin} 1 {t.minDaysUnit} · {t.shippingMin} {settings.shippingMinDays} {t.minDaysUnit}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            {t.shippingPolicy(...shippingPolicyArgs(settings.shippingMinDays))}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {t.deposit} {formatMoney(style.deposit_cents, { whole: true })}
            {t.depositReturned}
          </p>

          <div className="mt-6 border-t border-neutral-200 pt-6">
            {sizes.length === 0 ? (
              <p className="text-neutral-500">{t.notRentable}</p>
            ) : (
              <BookingPanel
                styleId={style.id}
                rentalPricesCents={prices}
                shippingMinDays={settings.shippingMinDays}
                depositCents={style.deposit_cents}
                pantsOption={pantsOption}
                sizes={sizes}
                today={today}
                maxRentalDays={settings.maxRentalDays}
                paddings={settings.paddings}
                initial={initial}
                addOnOptions={addOnOptions}
                initialAddOnSlug={addonSlug}
                locale={locale}
              />
            )}
          </div>

          <div className="mt-8 border-t border-neutral-200">
            {parseDescription(style.description).map((section, index) => (
              <Accordion key={index} title={section.title ?? t.description} defaultOpen={index === 0}>
                <DescriptionBlocks blocks={section.blocks} />
              </Accordion>
            ))}
            <Accordion title={t.rentalNotes}>
              <ul className="list-disc space-y-1 pl-5">
                {t.rentalNotesBody.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Link href={href("/rental-info")} className="mt-2 inline-block underline underline-offset-4">
                {t.fullRentalInfo}
              </Link>
            </Accordion>
            <Accordion title={t.questions}>
              <p>{t.questionsBody}</p>
              <Link href={href("/contact")} className="mt-2 inline-block underline underline-offset-4">
                {messages.nav.contact}
              </Link>
            </Accordion>
          </div>

          {style.source_url && (
            <p className="mt-4 text-xs text-neutral-400">
              {t.sourceCredit}
              <a
                href={style.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:text-neutral-600"
              >
                {style.brand || new URL(style.source_url).hostname} {t.officialSite}
              </a>
            </p>
          )}
        </div>
      </div>

      <StyleReviews styleId={style.id} locale={locale} />

      {related.length > 0 && (
        <section className="px-2 pt-14 md:px-0">
          <h2 className="px-2 text-xl font-black md:px-0">{t.related}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-4 sm:gap-x-4">
            {related.map((s) => (
              <li key={s.id}>
                <ProductCard
                  style={s}
                  sizes={(availability.get(s.id) ?? []).map((x) => x.size)}
                  fromCents={stylePriceTable(s, settings)[0]}
                  wasCents={crystalRegularTable(s, settings)?.[0]}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DescriptionBlocks({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-neutral-200" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold">
        {title}
        <span className="text-lg leading-none transition group-open:rotate-45">+</span>
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-neutral-700">{children}</div>
    </details>
  );
}

function DetailSkeleton() {
  return (
    <div className="md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12" aria-busy="true">
      <div className="aspect-[3/5] animate-pulse bg-neutral-100" />
      <div className="space-y-3 px-4 pt-5 md:px-0 md:pt-0">
        <div className="h-8 w-2/3 animate-pulse bg-neutral-100" />
        <div className="h-6 w-1/3 animate-pulse bg-neutral-100" />
        <div className="h-64 animate-pulse bg-neutral-100" />
      </div>
    </div>
  );
}
