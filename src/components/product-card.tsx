import Link from "next/link";
import type { PublicStyle } from "@/lib/catalog";
import { localePath, type Locale } from "@/i18n/config";
import { getMessages, sizeLabel } from "@/messages";
import { RentFrom } from "./rent-from";
import { StyleImage } from "./style-image";

export function ProductCard({
  style,
  sizes,
  query = "",
  fromCents,
  locale,
}: {
  style: PublicStyle;
  sizes: string[];
  /** 带到详情页的日期/尺码参数，例如 "?start=...&end=..." */
  query?: string;
  /** 起租价：价目表第 1 档（成套、外套、雪裤各不相同，见 stylePriceTable） */
  fromCents: number;
  locale: Locale;
}) {
  const messages = getMessages(locale);
  return (
    <Link href={localePath(locale, `/styles/${style.slug}${query}`)} className="group block">
      <div className="overflow-hidden">
        <div className="transition duration-500 group-hover:scale-[1.03]">
          <StyleImage
            src={style.image_urls[0]}
            alt={style.name}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            thumb
          />
        </div>
      </div>
      <div className="mt-2.5 space-y-0.5 px-0.5">
        {style.brand && (
          <p className="text-[11px] uppercase tracking-widest text-neutral-500">{style.brand}</p>
        )}
        <p className="text-sm leading-snug">{style.name}</p>
        <p className="text-sm">
          <RentFrom cents={fromCents} locale={locale} />
        </p>
        {sizes.length > 0 && (
          <p className="text-xs text-neutral-500">
            {messages.product.size} {sizes.map((s) => sizeLabel(s, locale)).join(" / ")}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[3/5] animate-pulse bg-neutral-100" />
          <div className="mt-2.5 h-4 w-2/3 animate-pulse bg-neutral-100" />
          <div className="mt-1.5 h-4 w-1/3 animate-pulse bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}
