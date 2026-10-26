import type { Metadata } from "next";
import { Suspense } from "react";
import { CrystalBadge, GlovesCard } from "@/components/gloves-card";
import { HelmetGridSkeleton } from "@/components/helmet-cover-card";
import { RentalFilterForm } from "@/components/rental-filter-form";
import { FilterSection } from "@/components/filter-chips";
import { FilterPanel, ShopColumns } from "@/components/filter-panel";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { availableCounts, getAvailability, getSettings, getToday, listStyles, type PublicStyle } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { isCrystal } from "@/lib/gloves";
import { parseRentalSearch } from "@/lib/validation/rental-query";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).gloves.title };
}

export default async function GlovesPage({ searchParams }: PageProps<"/[lang]/gloves">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-[88rem] px-2 py-8 sm:px-4 sm:py-12 lg:px-6">
      <Suspense fallback={<HelmetGridSkeleton />}>
        <GlovesList searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function GlovesList({
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/gloves">, "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.gloves;
  const [raw, today, settings, gloves] = await Promise.all([
    searchParams,
    getToday(),
    getSettings(),
    listStyles({ kind: "gloves", locale }),
  ]);
  const search = parseRentalSearch(raw, { today, maxRentalDays: settings.glovesMaxRentalDays });
  const ranged =
    search.kind === "valid"
      ? availableCounts(await getAvailability({ start: search.start, end: search.end }))
      : null;
  const visible = gloves.filter((g) => !ranged || (ranged.get(g.id) ?? 0) > 0);
  const crystal = visible.filter(isCrystal);
  const regular = visible.filter((g) => !isCrystal(g));
  const detailSuffix =
    search.kind === "valid" ? `?${new URLSearchParams({ start: search.start, end: search.end })}` : "";

  return (
    <>
      <div className="px-2 sm:px-0">
        <h1 className="text-3xl font-black">{t.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.subtitle}</p>

      </div>

      <ShopColumns
        filters={
          <div className="px-2 sm:px-0">
            <FilterPanel
              title={messages.filterForm.title}
              activeCount={search.kind === "valid" ? 1 : 0}
              closeLabel={messages.filterForm.close}
            >
              <FilterSection title={messages.filterForm.dates}>
                <RentalFilterForm
                  action="/gloves"
                  today={today}
                  sizes={[]}
                  start={search.kind !== "none" ? search.start : undefined}
                  end={search.kind !== "none" ? search.end : undefined}
                  locale={locale}
                />
              </FilterSection>
              {/* Crystal 和经典手套的价格说明放在筛选栏里，商品区一打开就是手套 */}
              <FilterSection title={t.pricing}>
                <dl className="space-y-3 text-xs leading-relaxed text-neutral-600">
                  {crystal.length > 0 && (
                    <div>
                      <dt>
                        <CrystalBadge />
                      </dt>
                      <dd className="mt-1">
                        <span className="font-semibold text-neutral-900">{t.crystalTitle}</span> · {t.crystalBody}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline-block border border-neutral-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-700">
                      {t.regularTitle}
                    </dt>
                    <dd className="mt-1">{t.regularBody}</dd>
                  </div>
                </dl>
              </FilterSection>
            </FilterPanel>
          </div>
        }
      >
        {search.kind === "valid" && (
          <p className="mx-2 mt-4 text-sm text-neutral-500 sm:mx-0 lg:mt-0 lg:mb-4">
            {t.availableCount(formatDateRange(search.start, search.end, locale), visible.length)}
          </p>
        )}
        {search.kind === "invalid" && (
          <p className="mx-2 mt-4 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-0 lg:mt-0 lg:mb-4">
            {search.error === "too_long"
              ? messages.filterForm.tooLong(settings.glovesMaxRentalDays)
              : messages.rangeErrors[search.error]}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="mx-2 mt-5 border border-dashed border-neutral-300 px-4 py-14 text-center text-sm text-neutral-500 sm:mx-0 lg:mt-0">
            {t.empty}
          </p>
        ) : (
          <GlovesGrid gloves={[...crystal, ...regular]} query={detailSuffix} locale={locale} />
        )}
      </ShopColumns>
    </>
  );
}

function GlovesGrid({
  gloves,
  query,
  locale,
}: {
  gloves: PublicStyle[];
  query: string;
  locale: Locale;
}) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:mt-0 xl:grid-cols-4">
      {gloves.map((g) => (
        <li key={g.id}>
          <GlovesCard gloves={g} query={query} dark={isCrystal(g)} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
