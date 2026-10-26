import Link from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { PublicStyle } from "@/lib/catalog";
import { isCrystal } from "@/lib/gloves";
import { formatMoney } from "@/lib/money";
import { rentalPriceCents } from "@/lib/pricing";
import { getMessages } from "@/messages";
import { RentFrom } from "./rent-from";
import { StyleImage } from "./style-image";

/** Crystal Collection 标记 */
export function CrystalBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white ${className}`}
    >
      ✦ Crystal
    </span>
  );
}

export function GlovesCard({
  gloves,
  unavailable,
  query = "",
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  dark,
  locale,
}: {
  gloves: PublicStyle;
  /** 选了日期且这段时间被订满时为 true */
  unavailable?: boolean;
  query?: string;
  sizes?: string;
  /** Crystal Collection：黑色卡片 */
  dark?: boolean;
  locale: Locale;
}) {
  const t = getMessages(locale).gloves;
  const prices = gloves.rental_prices_cents ?? [gloves.daily_price_cents];
  const colorCount = Object.keys(gloves.variant_images).length;
  return (
    <Link
      href={localePath(locale, `/gloves/${gloves.slug}${query}`)}
      className={`group block h-full ${dark ? "bg-neutral-950 pb-3 text-white" : ""}`}
    >
      <div className="relative overflow-hidden">
        <div className={`transition duration-500 group-hover:scale-[1.03] ${unavailable ? "opacity-50" : ""}`}>
          <StyleImage src={gloves.image_urls[0]} alt={gloves.name} sizes={sizes} thumb />
        </div>
        {isCrystal(gloves) && <CrystalBadge className="absolute left-2 top-2" />}
        {unavailable && (
          <span className="absolute inset-x-2 bottom-2 bg-white/90 py-1 text-center text-xs font-semibold">
            {t.unavailable}
          </span>
        )}
      </div>
      <div className={`mt-2.5 space-y-0.5 ${dark ? "px-2.5 [&_.text-neutral-500]:text-neutral-400" : "px-0.5"}`}>
        {gloves.brand && <p className="text-[11px] uppercase tracking-widest text-neutral-500">{gloves.brand}</p>}
        <p className="text-sm leading-snug">{gloves.name}</p>
        <p className="text-sm">
          <RentFrom cents={rentalPriceCents(prices, 1)} locale={locale} />
          <span className="text-neutral-500"> · {t.upTo(formatMoney(prices[prices.length - 1], { whole: true }))}</span>
        </p>
        {colorCount > 1 && <p className="text-xs text-neutral-500">{t.colorCount(colorCount)}</p>}
      </div>
    </Link>
  );
}
