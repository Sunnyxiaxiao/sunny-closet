import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { getMessages } from "@/messages";

/** 起租价，写清楚是租金不是售价：「租金 $49 起」/「Rent from $49」。特惠期内传 wasCents，正价划掉显示在前面 */
export function RentFrom({
  cents,
  wasCents,
  locale,
  priceClassName = "font-bold",
}: {
  cents: number;
  wasCents?: number;
  locale: Locale;
  priceClassName?: string;
}) {
  const t = getMessages(locale).product.rentFrom;
  return (
    <>
      <span className="text-neutral-500">{t.prefix} </span>
      {wasCents !== undefined && wasCents > cents && (
        <>
          <s className="text-neutral-500">{formatMoney(wasCents, { whole: true })}</s>{" "}
        </>
      )}
      <span className={priceClassName}>{formatMoney(cents, { whole: true })}</span>
      {t.suffix && <span className="text-neutral-500"> {t.suffix}</span>}
    </>
  );
}
