import type { Metadata } from "next";
import { Suspense } from "react";
import { GlovesCard } from "@/components/gloves-card";
import { HelmetGridSkeleton } from "@/components/helmet-cover-card";
import { RentalFilterForm } from "@/components/rental-filter-form";
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
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12">
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

        <details className="group mt-4 border-y border-neutral-200" open={search.kind !== "none"}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-medium">
            {search.kind === "valid"
              ? t.availableCount(formatDateRange(search.start, search.end, locale), visible.length)
              : t.dateFilter}
            <span className="text-lg leading-none transition group-open:rotate-45">+</span>
          </summary>
          <div className="pb-4">
            <RentalFilterForm
              action="/gloves"
              today={today}
              sizes={[]}
              start={search.kind !== "none" ? search.start : undefined}
              end={search.kind !== "none" ? search.end : undefined}
              locale={locale}
            />
          </div>
        </details>

        {search.kind === "invalid" && (
          <p className="mt-4 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {search.error === "too_long"
              ? messages.filterForm.tooLong(settings.glovesMaxRentalDays)
              : messages.rangeErrors[search.error]}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mx-2 mt-8 border border-dashed border-neutral-300 px-4 py-14 text-center text-sm text-neutral-500 sm:mx-0">
          {t.empty}
        </p>
      ) : (
        <>
          {crystal.length > 0 && (
            <section className="mt-8 bg-neutral-950 px-3 pb-8 pt-6 text-white sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-400">✦ {t.crystalBadge}</p>
              <h2 className="mt-1 text-2xl font-black">{t.crystalTitle}</h2>
              <p className="mt-1 text-sm text-neutral-300">{t.crystalBody}</p>
              <GlovesGrid gloves={crystal} query={detailSuffix} locale={locale} dark />
            </section>
          )}
          <section className="mt-10 px-2 sm:px-0">
            <h2 className="text-2xl font-black">{t.regularTitle}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t.regularBody}</p>
            {regular.length > 0 ? (
              <GlovesGrid gloves={regular} query={detailSuffix} locale={locale} />
            ) : (
              <p className="mt-5 border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
                {t.regularEmpty}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function GlovesGrid({
  gloves,
  query,
  locale,
  dark,
}: {
  gloves: PublicStyle[];
  query: string;
  locale: Locale;
  dark?: boolean;
}) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
      {gloves.map((g) => (
        <li key={g.id}>
          <GlovesCard gloves={g} query={query} dark={dark} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
