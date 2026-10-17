import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RentalFilterForm } from "@/components/rental-filter-form";
import { StyleImage } from "@/components/style-image";
import { getAvailability, getSettings, getToday, listStyles } from "@/lib/catalog";
import { formatShortDateZh } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { sortSizes } from "@/lib/sizes";
import { parseRentalSearch, rangeErrorMessages } from "@/lib/validation/rental-query";

export const metadata: Metadata = { title: "全部款式" };

export default function StylesPage({ searchParams }: PageProps<"/styles">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold">全部款式</h1>
      <p className="mt-1 text-sm text-slate-600">选择日期和尺码，只看这段时间还能租到的款式。</p>
      <Suspense fallback={<StylesSkeleton />}>
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
  const allSizes = await getAvailability();
  const sizeOptions = sortSizes([...allSizes.values()].flat().map((s) => s.size));
  const ranged =
    search.kind === "valid" ? await getAvailability({ start: search.start, end: search.end }) : null;

  const size = search.size;
  const rows = styles
    .map((style) => {
      const sizes = (ranged ?? allSizes).get(style.id) ?? [];
      const relevant = size ? sizes.filter((s) => s.size === size) : sizes;
      const available = relevant.reduce((sum, s) => sum + s.available, 0);
      return { style, sizes, relevant, available };
    })
    .filter((row) => (size ? row.relevant.length > 0 : true))
    .filter((row) => (ranged ? row.available > 0 : true));

  const linkQuery = new URLSearchParams();
  if (search.kind === "valid") {
    linkQuery.set("start", search.start);
    linkQuery.set("end", search.end);
  }
  if (size) linkQuery.set("size", size);
  const suffix = linkQuery.size ? `?${linkQuery}` : "";

  return (
    <div className="mt-5 space-y-5">
      <RentalFilterForm
        today={today}
        sizes={sizeOptions}
        start={search.kind !== "none" ? search.start : undefined}
        end={search.kind !== "none" ? search.end : undefined}
        size={size}
      />

      {search.kind === "invalid" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {search.error === "too_long"
            ? `租期最长 ${settings.maxRentalDays} 天，请缩短日期范围。`
            : rangeErrorMessages[search.error]}
        </p>
      )}

      {search.kind === "valid" && (
        <p className="text-sm text-slate-600">
          {formatShortDateZh(search.start)} – {formatShortDateZh(search.end)}
          {size ? ` · 尺码 ${size}` : ""}：共 {rows.length} 款可租
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-slate-500">
          {ranged ? "这段时间暂无可租的款式，换个日期或尺码试试。" : "暂无款式。"}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {rows.map(({ style, sizes, available }) => (
            <li key={style.id}>
              <Link
                href={`/styles/${style.slug}${suffix}`}
                className="block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-md"
              >
                <StyleImage
                  src={style.image_urls[0]}
                  alt={style.name}
                  sizes="(min-width: 640px) 33vw, 50vw"
                />
                <div className="space-y-1 p-3">
                  <p className="font-medium leading-snug">{style.name}</p>
                  <p className="text-sm">
                    <span className="font-semibold text-brand-700">{formatMoney(style.daily_price_cents)}</span>
                    <span className="text-slate-500"> / 天</span>
                  </p>
                  <p className="text-xs text-slate-500">押金 {formatMoney(style.deposit_cents)}</p>
                  <p className="text-xs text-slate-500">
                    {ranged ? `该时段可租 ${available} 件` : `尺码：${sizes.map((s) => s.size).join(" / ") || "—"}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StylesSkeleton() {
  return (
    <div className="mt-5 space-y-5" aria-busy="true">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
