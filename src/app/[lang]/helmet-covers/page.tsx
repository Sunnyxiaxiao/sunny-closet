import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterChips } from "@/components/filter-chips";
import { HelmetCoverCard, HelmetGridSkeleton } from "@/components/helmet-cover-card";
import { RentalFilterForm } from "@/components/rental-filter-form";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { availableCounts, getAvailability, getSettings, getToday, listStyles } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { HELMET_COVER_DEFAULTS, HELMET_COVER_TIERS, HELMET_TAG_GROUPS, isHelmetCoverTier } from "@/lib/helmet-covers";
import { formatMoney } from "@/lib/money";
import { parseRentalSearch } from "@/lib/validation/rental-query";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).helmet.title };
}

export default async function HelmetCoversPage({ searchParams }: PageProps<"/[lang]/helmet-covers">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12">
      <Suspense fallback={<HelmetGridSkeleton />}>
        <HelmetCovers searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function HelmetCovers({
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/helmet-covers">, "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.helmet;
  const [raw, today, settings, covers] = await Promise.all([
    searchParams,
    getToday(),
    getSettings(),
    listStyles({ kind: "helmet_cover", locale }),
  ]);
  const search = parseRentalSearch(raw, { today, maxRentalDays: settings.maxRentalDays });
  const ranged =
    search.kind === "valid"
      ? availableCounts(await getAvailability({ start: search.start, end: search.end }))
      : null;

  const rawTier = first(raw.tier);
  const tier = isHelmetCoverTier(rawTier) ? rawTier : undefined;
  const presentTags = new Set(covers.flatMap((c) => c.tags));
  const colors = HELMET_TAG_GROUPS.color.filter((tag) => presentTags.has(tag));
  const styleTags = HELMET_TAG_GROUPS.style.filter((tag) => presentTags.has(tag));
  const color = colors.find((c) => c === first(raw.color));
  const style = styleTags.find((s) => s === first(raw.style));

  const visible = covers
    .filter((c) => !tier || c.tier === tier)
    .filter((c) => !color || c.tags.includes(color))
    .filter((c) => !style || c.tags.includes(style))
    .filter((c) => !ranged || (ranged.get(c.id) ?? 0) > 0);

  const current = { tier, color, style } as Record<string, string | undefined>;
  const dateQuery = new URLSearchParams();
  if (search.kind === "valid") {
    dateQuery.set("start", search.start);
    dateQuery.set("end", search.end);
  }
  const detailSuffix = dateQuery.size ? `?${dateQuery}` : "";

  function href(key: "tier" | "color" | "style", value?: string) {
    const q = new URLSearchParams(dateQuery);
    for (const [k, v] of Object.entries({ ...current, [key]: value })) if (v) q.set(k, v);
    return localePath(locale, q.size ? `/helmet-covers?${q}` : "/helmet-covers");
  }

  const tagLabel = (tag: string) => t.tags[tag] ?? tag;
  const addOnPrices = covers.flatMap((c) => (c.addon_price_cents === null ? [] : [c.addon_price_cents]));
  const minAddOn = addOnPrices.length ? Math.min(...addOnPrices) : HELMET_COVER_DEFAULTS.addOnCents.regular;

  return (
    <>
      <div className="px-2 sm:px-0">
        <h1 className="text-3xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.subtitle}</p>

        <Link
          href={localePath(locale, "/styles")}
          className="mt-4 flex items-center justify-between gap-3 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <span>{t.addOnFrom(formatMoney(minAddOn, { whole: true }))}</span>
          <span aria-hidden="true">→</span>
        </Link>

        <FilterChips
          label={t.filters.tier}
          allLabel={t.filters.all}
          options={HELMET_COVER_TIERS.map((value) => ({ value, label: t.tiers[value] }))}
          active={tier}
          href={(value) => href("tier", value)}
        />
        {colors.length > 0 && (
          <FilterChips
            label={t.filters.color}
            allLabel={t.filters.all}
            options={colors.map((value) => ({ value, label: tagLabel(value) }))}
            active={color}
            href={(value) => href("color", value)}
          />
        )}
        {styleTags.length > 0 && (
          <FilterChips
            label={t.filters.style}
            allLabel={t.filters.all}
            options={styleTags.map((value) => ({ value, label: tagLabel(value) }))}
            active={style}
            href={(value) => href("style", value)}
          />
        )}

        <details className="group mt-4 border-y border-neutral-200" open={search.kind !== "none"}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-medium">
            {search.kind === "valid"
              ? t.availableCount(formatDateRange(search.start, search.end, locale), visible.length)
              : t.dateFilter}
            <span className="text-lg leading-none transition group-open:rotate-45">+</span>
          </summary>
          <div className="pb-4">
            <RentalFilterForm
              action="/helmet-covers"
              today={today}
              sizes={[]}
              keepParams={current}
              start={search.kind !== "none" ? search.start : undefined}
              end={search.kind !== "none" ? search.end : undefined}
              locale={locale}
            />
          </div>
        </details>

        {search.kind === "invalid" && (
          <p className="mt-4 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {search.error === "too_long"
              ? messages.filterForm.tooLong(settings.maxRentalDays)
              : messages.rangeErrors[search.error]}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mx-2 mt-8 border border-dashed border-neutral-300 px-4 py-14 text-center text-sm text-neutral-500 sm:mx-0">
          {t.empty}
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {visible.map((cover) => (
            <li key={cover.id}>
              <HelmetCoverCard cover={cover} query={detailSuffix} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
