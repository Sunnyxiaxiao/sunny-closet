import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingPanel } from "@/components/booking-panel";
import { StyleImage } from "@/components/style-image";
import { getAvailability, getSettings, getStyleBySlug, getToday } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import { rentalSearchParamsSchema } from "@/lib/validation/rental-query";

export default function StyleDetailPage({ params, searchParams }: PageProps<"/styles/[slug]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <Link href="/styles" className="text-sm text-brand-700 hover:underline">
        ← 全部款式
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <StyleDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StyleDetail({ params, searchParams }: PageProps<"/styles/[slug]">) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const style = await getStyleBySlug(slug);
  if (!style) notFound();

  const [settings, today, availability] = await Promise.all([
    getSettings(),
    getToday(),
    getAvailability({ styleId: style.id }),
  ]);
  const sizes = availability.get(style.id) ?? [];
  const initial = rentalSearchParamsSchema.parse(raw);

  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <StyleImage src={style.image_urls[0]} alt={style.name} sizes="(min-width: 768px) 50vw, 100vw" priority />
        </div>
        {style.image_urls.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {style.image_urls.slice(1).map((url) => (
              <div key={url} className="overflow-hidden rounded-xl border border-slate-200">
                <StyleImage src={url} alt={style.name} sizes="25vw" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold">{style.name}</h1>
        <p className="mt-2 text-lg">
          <span className="font-semibold text-brand-700">{formatMoney(style.daily_price_cents)}</span>
          <span className="text-slate-500"> / 天</span>
          <span className="ml-3 text-sm text-slate-500">押金 {formatMoney(style.deposit_cents)}</span>
        </p>
        {style.description && (
          <p className="mt-3 whitespace-pre-line text-slate-700">{style.description}</p>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          {sizes.length === 0 ? (
            <p className="text-slate-500">该款式暂时没有可租的库存。</p>
          ) : (
            <BookingPanel
              styleId={style.id}
              dailyPriceCents={style.daily_price_cents}
              depositCents={style.deposit_cents}
              sizes={sizes}
              today={today}
              maxRentalDays={settings.maxRentalDays}
              bufferDays={settings.bufferDays}
              initial={initial}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10" aria-busy="true">
      <div className="aspect-square animate-pulse rounded-2xl bg-slate-200" />
      <div className="space-y-3">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-6 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    </div>
  );
}
