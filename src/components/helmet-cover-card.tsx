import Link from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { PublicStyle } from "@/lib/catalog";
import { rentalPriceCents } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import type { HelmetCoverTier } from "@/lib/supabase/database.types";
import { getMessages } from "@/messages";
import { StyleImage } from "./style-image";

export function TierBadge({
  tier,
  locale,
  className = "",
}: {
  tier: HelmetCoverTier;
  locale: Locale;
  className?: string;
}) {
  const t = getMessages(locale).helmet;
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
        tier === "premium" ? "bg-neutral-900 text-white" : "bg-white/90 text-neutral-900 ring-1 ring-neutral-900/10",
        className,
      ].join(" ")}
    >
      {t.tiers[tier]}
    </span>
  );
}

export function HelmetCoverCard({
  cover,
  unavailable,
  query = "",
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  locale,
}: {
  cover: PublicStyle;
  /** 选了日期且这段时间被订满时为 true */
  unavailable?: boolean;
  query?: string;
  sizes?: string;
  locale: Locale;
}) {
  const t = getMessages(locale).helmet;
  const fromCents = cover.rental_prices_cents ? rentalPriceCents(cover.rental_prices_cents, 1) : null;
  return (
    <Link href={localePath(locale, `/helmet-covers/${cover.slug}${query}`)} className="group block">
      <div className="relative overflow-hidden">
        <div className={`transition duration-500 group-hover:scale-[1.03] ${unavailable ? "opacity-50" : ""}`}>
          <StyleImage src={cover.image_urls[0]} alt={cover.name} sizes={sizes} aspect="helmet" />
        </div>
        {cover.tier && <TierBadge tier={cover.tier} locale={locale} className="absolute left-2 top-2" />}
        {unavailable && (
          <span className="absolute inset-x-2 bottom-2 bg-white/90 py-1 text-center text-xs font-semibold">
            {t.unavailable}
          </span>
        )}
      </div>
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <p className="text-sm leading-snug">{cover.name}</p>
        {fromCents !== null && (
          <p className="text-sm">
            <span className="text-neutral-500">{t.standaloneFrom} </span>
            <span className="font-bold">{formatMoney(fromCents, { whole: true })}</span>
            {t.from && <span className="text-neutral-500"> {t.from}</span>}
          </p>
        )}
        {cover.addon_price_cents !== null && (
          <p className="text-xs font-semibold text-rose-600">
            {t.withOutfit} +{formatMoney(cover.addon_price_cents, { whole: true })}
          </p>
        )}
      </div>
    </Link>
  );
}

export function HelmetGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-square animate-pulse bg-neutral-100" />
          <div className="mt-2.5 h-4 w-2/3 animate-pulse bg-neutral-100" />
          <div className="mt-1.5 h-4 w-1/3 animate-pulse bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}
