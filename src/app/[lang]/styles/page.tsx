import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterChips, FilterSection } from "@/components/filter-chips";
import { FilterPanel, ShopColumns } from "@/components/filter-panel";
import { ProductCard, ProductGridSkeleton } from "@/components/product-card";
import { RentalFilterForm } from "@/components/rental-filter-form";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getAvailability, getSettings, getStyleBySlug, getToday, listStyles, crystalRegularTable,
  stylePriceTable } from "@/lib/catalog";
import { STYLE_CATEGORIES, isStyleCategory } from "@/lib/categories";
import { formatDateRange } from "@/lib/dates";
import { CRYSTAL_TAG, isCrystal } from "@/lib/gloves";
import { sortSizes } from "@/lib/sizes";
import { parseRentalSearch } from "@/lib/validation/rental-query";
import { getMessages, sizeLabel } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).styles.title };
}

export default async function StylesPage({ searchParams }: PageProps<"/[lang]/styles">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-[88rem] px-2 py-8 sm:px-4 sm:py-12 lg:px-6">
      <Suspense
        fallback={
          <>
            <div className="mx-2 mb-8 h-9 w-40 animate-pulse bg-neutral-100 sm:mx-0" />
            <ProductGridSkeleton />
          </>
        }
      >
        <StylesContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function StylesContent({
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/styles">, "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.styles;
  const [raw, today, settings, styles] = await Promise.all([
    searchParams,
    getToday(),
    getSettings(),
    listStyles({ locale }),
  ]);
  const search = parseRentalSearch(raw, { today, maxRentalDays: settings.maxRentalDays });
  const rawCategory = Array.isArray(raw.category) ? raw.category[0] : raw.category;
  const category = isStyleCategory(rawCategory) ? rawCategory : undefined;
  const presentBrands = [...new Set(styles.map((s) => s.brand).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const rawBrand = Array.isArray(raw.brand) ? raw.brand[0] : raw.brand;
  const brand = rawBrand && presentBrands.includes(rawBrand) ? rawBrand : undefined;
  const hasCrystal = styles.some(isCrystal);
  const rawCollection = Array.isArray(raw.collection) ? raw.collection[0] : raw.collection;
  const collection = hasCrystal && rawCollection === CRYSTAL_TAG ? CRYSTAL_TAG : undefined;

  const allSizes = await getAvailability();
  const sizeOptions = sortSizes([...allSizes.values()].flat().map((s) => s.size));
  const ranged =
    search.kind === "valid" ? await getAvailability({ start: search.start, end: search.end }) : null;

  const size = search.size;
  const rows = styles
    .filter((style) => !category || style.category === category)
    .filter((style) => !brand || style.brand === brand)
    .filter((style) => !collection || isCrystal(style))
    // Crystal Collection 排在最前面（其余保持原来的顺序）
    .toSorted((a, b) => Number(isCrystal(b)) - Number(isCrystal(a)))
    .map((style) => {
      const sizes = allSizes.get(style.id) ?? [];
      const relevant = (ranged ?? allSizes).get(style.id) ?? [];
      const matching = size ? relevant.filter((s) => s.size === size) : relevant;
      const available = matching.reduce((sum, s) => sum + s.available, 0);
      return { style, sizes, matching, available };
    })
    .filter((row) => (size ? row.matching.length > 0 : true))
    .filter((row) => (ranged ? row.available > 0 : true));

  const presentCategories = STYLE_CATEGORIES.filter((c) => styles.some((s) => s.category === c));

  const filterQuery = new URLSearchParams();
  if (search.kind === "valid") {
    filterQuery.set("start", search.start);
    filterQuery.set("end", search.end);
  }
  if (size) filterQuery.set("size", size);
  // 从头盔套页点“搭配雪服一起租”过来：带着这顶头盔套去雪服详情页
  const rawAddon = Array.isArray(raw.addon) ? raw.addon[0] : raw.addon;
  const addOn = rawAddon ? await getStyleBySlug(rawAddon, { kind: "helmet_cover", locale }) : null;
  if (addOn) filterQuery.set("addon", addOn.slug);
  const detailSuffix = filterQuery.size ? `?${filterQuery}` : "";

  function listHref(next: { category?: string; brand?: string; collection?: string; dropAddOn?: boolean }) {
    const q = new URLSearchParams(filterQuery);
    if (next.dropAddOn) q.delete("addon");
    if (next.category) q.set("category", next.category);
    if (next.brand) q.set("brand", next.brand);
    if (next.collection) q.set("collection", next.collection);
    return localePath(locale, q.size ? `/styles?${q}` : "/styles");
  }

    const filters = (
    <FilterPanel
      title={messages.filterForm.title}
      activeCount={[collection, category, brand, size, search.kind === "valid" ? "dates" : undefined].filter(Boolean).length}
      closeLabel={messages.filterForm.close}
    >
      {hasCrystal && (
        <FilterChips
          label={t.collectionLabel}
          allLabel={t.allCategories}
          options={[{ value: CRYSTAL_TAG, label: "✦ Crystal Collection" }]}
          active={collection}
          href={(c) => listHref({ category, brand, collection: c })}
        />
      )}
      {presentCategories.length > 1 && (
        <FilterChips
          label={t.categoryLabel}
          allLabel={t.allCategories}
          options={presentCategories.map((c) => ({ value: c, label: messages.categories[c] }))}
          active={category}
          href={(c) => listHref({ category: c, brand, collection })}
        />
      )}
      {presentBrands.length > 0 && (
        <FilterChips
          label={t.brandLabel}
          allLabel={t.allBrands}
          options={presentBrands.map((b) => ({ value: b, label: b }))}
          active={brand}
          href={(b) => listHref({ category, brand: b, collection })}
        />
      )}
      <FilterSection title={messages.filterForm.dates}>
        <RentalFilterForm
          today={today}
          sizes={sizeOptions}
          keepParams={{ category, brand, collection, addon: addOn?.slug }}
          start={search.kind !== "none" ? search.start : undefined}
          end={search.kind !== "none" ? search.end : undefined}
          size={size}
          locale={locale}
        />
      </FilterSection>
    </FilterPanel>
  );

  return (
    <>
      <div className="px-2 sm:px-0">
        <h1 className="text-3xl font-black">
          {[collection && "Crystal Collection", brand, category && messages.categories[category]]
            .filter(Boolean)
            .join(" · ") ||
            t.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {search.kind === "valid"
            ? t.availableSummary(
                formatDateRange(search.start, search.end, locale),
                size && sizeLabel(size, locale),
                rows.length,
              )
            : t.count(rows.length)}
        </p>

        {addOn && (
          <p className="mt-4 flex items-center justify-between gap-3 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <span>{t.addOnBanner(addOn.name)}</span>
            <Link href={listHref({ category, brand, collection, dropAddOn: true })} className="shrink-0 underline underline-offset-4">
              {t.dropAddOn}
            </Link>
          </p>
        )}
      </div>

      <ShopColumns filters={<div className="px-2 sm:px-0">{filters}</div>}>
        {search.kind === "invalid" && (
          <p className="mx-2 mt-4 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-0 lg:mt-0">
            {search.error === "too_long"
              ? messages.filterForm.tooLong(settings.maxRentalDays)
              : messages.rangeErrors[search.error]}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="mx-2 mt-5 border border-dashed border-neutral-300 lg:mt-0 px-4 py-14 text-center text-sm text-neutral-500 sm:mx-0">
            {ranged ? t.emptyRanged : t.empty}
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:mt-0 xl:grid-cols-4">
            {rows.map(({ style, sizes }) => (
              <li key={style.id}>
                <ProductCard
                  style={style}
                  sizes={sizes.map((s) => s.size)}
                  query={detailSuffix}
                  fromCents={stylePriceTable(style, settings)[0]}
                  wasCents={crystalRegularTable(style, settings)?.[0]}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        )}
      </ShopColumns>
    </>
  );
}
