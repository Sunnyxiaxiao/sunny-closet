import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GlovesCard } from "@/components/gloves-card";
import { HelmetCoverStage } from "@/components/helmet-cover-stage";
import { PriceTierStrip } from "@/components/price-tier-strip";
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
import { capFromDays, isCrystal, variantImageIndex } from "@/lib/gloves";
import { CrystalBadge } from "@/components/gloves-card";
import { formatMoney } from "@/lib/money";
import { compareSizes } from "@/lib/sizes";
import { priceTiers } from "@/lib/pricing";
import { rentalSearchParamsSchema } from "@/lib/validation/rental-query";
import { getMessages } from "@/messages";
import { StyleReviews } from "@/components/style-reviews";

export async function generateMetadata({ params }: PageProps<"/[lang]/gloves/[slug]">): Promise<Metadata> {
  const locale = await getLocale();
  const t = getMessages(locale).gloves;
  const gloves = await getStyleBySlug((await params).slug, { kind: "gloves", locale });
  return { title: gloves ? t.metaTitle(gloves.name) : t.title };
}

export default async function GlovesDetailPage({ params, searchParams }: PageProps<"/[lang]/gloves/[slug]">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl md:px-4 md:py-8">
      <Suspense fallback={<div className="aspect-[3/5] animate-pulse bg-neutral-100 md:w-1/2" />}>
        <GlovesDetail params={params} searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function GlovesDetail({
  params,
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/gloves/[slug]">, "params" | "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.gloves;
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const gloves = await getStyleBySlug(slug, { kind: "gloves", locale });
  if (!gloves) notFound();

  const [settings, today, availability, all] = await Promise.all([
    getSettings(),
    getToday(),
    getAvailability({ styleId: gloves.id }),
    listStyles({ kind: "gloves", locale }),
  ]);
  // 颜色按图片顺序排，没有对应图片的排在最后
  const imageOf = (size: string) => gloves.variant_images[size] ?? Number.MAX_SAFE_INTEGER;
  // 同一颜色有几个尺码时按 S → M → L 排（「芭蕾粉 · S」「芭蕾粉 · M」）
  const sizeOf = (label: string) => label.split(" · ").at(-1) ?? label;
  const sizes = (availability.get(gloves.id) ?? []).toSorted(
    (a, b) => imageOf(a.size) - imageOf(b.size) || compareSizes(sizeOf(a.size), sizeOf(b.size)),
  );
  const prices = stylePriceTable(gloves, settings);
  const tiers = priceTiers(prices, settings.glovesMaxRentalDays, locale);
  const initial = rentalSearchParamsSchema.parse(raw);
  const related = all.filter((g) => g.id !== gloves.id).slice(0, 4);
  const sections = parseDescription(gloves.description);

  const info = (
    <>
      <nav className="text-xs text-neutral-500">
        <Link href={localePath(locale, "/gloves")} className="hover:underline">
          {t.title}
        </Link>
        {gloves.brand && <span> · {gloves.brand}</span>}
      </nav>
      {isCrystal(gloves) && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-600">
          <CrystalBadge />
          {t.crystalTitle} — {t.crystalBadge}
        </p>
      )}
      <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">{gloves.name}</h1>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-widest text-neutral-500">{t.pricing}</h2>
      <div className="mt-2">
        <PriceTierStrip tiers={tiers} locale={locale} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {t.capNote(
          capFromDays(prices),
          formatMoney(prices[prices.length - 1], { whole: true }),
          settings.glovesMaxRentalDays,
        )}
      </p>

      <p className="mt-4 border-l-2 border-neutral-900 pl-3 text-xs leading-relaxed text-neutral-600">{t.hygiene}</p>
      {gloves.replacement_value_cents !== null && (
        <p className="mt-2 text-xs text-neutral-500">
          {t.replacementValue}
          {formatMoney(gloves.replacement_value_cents, { whole: true })}
        </p>
      )}
    </>
  );

  const description = (
    <>
      {sections.some((s) => s.blocks.length > 0) && (
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
      )}
      {gloves.source_url && (
        <p className="mt-4 text-xs text-neutral-400">
          {messages.product.sourceCredit}
          <a
            href={gloves.source_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 hover:text-neutral-600"
          >
            {gloves.brand || new URL(gloves.source_url).hostname} {messages.product.officialSite}
          </a>
        </p>
      )}
    </>
  );

  return (
    <>
      {sizes.length === 0 ? (
        <div className="px-4 pt-5 md:px-0">
          {info}
          <p className="mt-6 text-neutral-500">{t.notRentable}</p>
        </div>
      ) : (
        <HelmetCoverStage
          images={gloves.image_urls}
          alt={gloves.name}
          aspect="outfit"
          choiceLabel={t.choiceLabel}
          imageIndexBySize={variantImageIndex(gloves.variant_images, gloves.image_urls.length)}
          before={info}
          after={description}
          panel={{
            styleId: gloves.id,
            rentalPricesCents: prices,
            shippingMinDays: settings.shippingMinDays,
            depositCents: gloves.deposit_cents,
            sizes,
            today,
            maxRentalDays: settings.glovesMaxRentalDays,
            paddings: settings.paddings,
            initial,
            locale,
          }}
        />
      )}

      <StyleReviews styleId={gloves.id} locale={locale} />

      {related.length > 0 && (
        <section className="px-2 pt-14 md:px-0">
          <h2 className="px-2 text-xl font-black md:px-0">{messages.product.related}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-4 sm:gap-x-4">
            {related.map((g) => (
              <li key={g.id}>
                <GlovesCard gloves={g} sizes="(min-width: 640px) 25vw, 50vw" locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
