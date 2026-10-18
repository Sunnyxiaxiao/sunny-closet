import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { getMessages } from "@/messages";
import type { PriceTier } from "@/lib/pricing";

/** 一排价格格子：每档一格，上面天数、下面价格。showPerDay 时在最长一档下面显示“低至 $x/天” */
export function PriceTierStrip({
  tiers,
  showPerDay,
  locale,
}: {
  tiers: PriceTier[];
  showPerDay?: boolean;
  locale: Locale;
}) {
  const t = getMessages(locale).product;
  return (
    <dl
      className="grid divide-x divide-neutral-200 border border-neutral-200"
      style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}
    >
      {tiers.map((tier, index) => {
        const isLongest = showPerDay && index === tiers.length - 1 && tiers.length > 1;
        return (
          <div key={tier.label} className="px-1 py-2.5 text-center">
            <dt className="text-xs text-neutral-500">{tier.label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(tier.cents, { whole: true })}</dd>
            {isLongest && (
              <dd className="mt-0.5 text-[11px] leading-tight text-neutral-500">
                {t.perDayFrom(formatMoney(Math.round(tier.cents / tier.maxDays / 100) * 100, { whole: true }))}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
