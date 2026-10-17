import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductCard, ProductGridSkeleton } from "@/components/product-card";
import { RentalFilterForm } from "@/components/rental-filter-form";
import { getAvailability, getSettings, getToday, listStyles } from "@/lib/catalog";
import { STYLE_CATEGORIES, isStyleCategory } from "@/lib/categories";
import { formatShortDateZh } from "@/lib/dates";
import { sortSizes } from "@/lib/sizes";
import { parseRentalSearch, rangeErrorMessages } from "@/lib/validation/rental-query";
import { messages } from "@/messages/zh-CN";

export const metadata: Metadata = { title: "全部雪服" };

export default function StylesPage({ searchParams }: PageProps<"/styles">) {
  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-4 sm:py-12">
      <Suspense
        fallback={
          <>
            <div className="mx-2 mb-8 h-9 w-40 animate-pulse bg-neutral-100 sm:mx-0" />
            <ProductGridSkeleton />
          </>
        }
      >
        <StylesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StylesContent({ searchParams }: Pick<PageProps<"/styles">, "searchParams">) {
  const [raw, today, settings, styles] = await Promise.all([
    searchParams,
    getToday(),
    getSettings(),
    listStyles(),
  ]);
  const search = parseRentalSearch(raw, { today, maxRentalDays: settings.maxRentalDays });
  const rawCategory = Array.isArray(raw.category) ? raw.category[0] : raw.category;
  const category = isStyleCategory(rawCategory) ? rawCategory : undefined;

  const allSizes = await getAvailability();
  const sizeOptions = sortSizes([...allSizes.values()].flat().map((s) => s.size));
  const ranged =
    search.kind === "valid" ? await getAvailability({ start: search.start, end: search.end }) : null;

  const size = search.size;
  const rows = styles
    .filter((style) => !category || style.category === category)
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
  const detailSuffix = filterQuery.size ? `?${filterQuery}` : "";

  function categoryHref(c?: string) {
    const q = new URLSearchParams(filterQuery);
    if (c) q.set("category", c);
    return q.size ? `/styles?${q}` : "/styles";
  }

  const hasRentalFilter = search.kind !== "none" || Boolean(size);

  return (
    <>
      <div className="px-2 sm:px-0">
        <h1 className="text-3xl font-black">{category ? messages.categories[category] : messages.nav.styles}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {search.kind === "valid"
            ? `${formatShortDateZh(search.start)} – ${formatShortDateZh(search.end)}${size ? ` · 尺码 ${size}` : ""}：${rows.length} 套可租`
            : `共 ${rows.length} 套`}
        </p>

        {presentCategories.length > 1 && (
          <nav className="no-scrollbar -mx-2 mt-5 flex gap-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
            {[undefined, ...presentCategories].map((c) => {
              const active = c === category;
              return (
                <Link
                  key={c ?? "all"}
                  href={categoryHref(c)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "shrink-0 rounded-full border px-4 py-1.5 text-sm transition",
                    active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 hover:border-neutral-900",
                  ].join(" ")}
                >
                  {c ? messages.categories[c] : "全部"}
                </Link>
              );
            })}
          </nav>
        )}

        <details className="group mt-4 border-y border-neutral-200" open={hasRentalFilter}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-medium">
            按日期 / 尺码筛选
            <span className="text-lg leading-none transition group-open:rotate-45">+</span>
          </summary>
          <div className="pb-4">
            <RentalFilterForm
              today={today}
              sizes={sizeOptions}
              category={category}
              start={search.kind !== "none" ? search.start : undefined}
              end={search.kind !== "none" ? search.end : undefined}
              size={size}
            />
          </div>
        </details>

        {search.kind === "invalid" && (
          <p className="mt-4 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {search.error === "too_long"
              ? `租期最长 ${settings.maxRentalDays} 天，请缩短日期范围。`
              : rangeErrorMessages[search.error]}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mx-2 mt-8 border border-dashed border-neutral-300 px-4 py-14 text-center text-sm text-neutral-500 sm:mx-0">
          {ranged ? "这段时间没有符合条件的雪服，换个日期或尺码试试。" : "暂无雪服。"}
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {rows.map(({ style, sizes }) => (
            <li key={style.id}>
              <ProductCard style={style} sizes={sizes.map((s) => s.size)} query={detailSuffix} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
