import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { getMessages } from "@/messages";
import { rentalPriceCents, type PriceTier } from "@/lib/pricing";

/** 手机上一排最多放几格，再多就折成两排（10 档挤在一排，价格会叠在一起） */
const MAX_PER_ROW_MOBILE = 5;

/** 一排价格格子：每档一格，上面天数、下面价格。showPerDay 时在最长一档下面显示“低至 $x/天” */
export function PriceTierStrip({
  tiers,
  showPerDay,
  regularPrices,
  locale,
}: {
  tiers: PriceTier[];
  showPerDay?: boolean;
  /** 特惠期内的正价表：每格在特惠价上面划掉显示 */
  regularPrices?: readonly number[] | null;
  locale: Locale;
}) {
  const t = getMessages(locale).product;
  // 窄屏：超过 5 档时平分成两排；宽屏始终一排
  const mobileColumns = tiers.length > MAX_PER_ROW_MOBILE ? Math.ceil(tiers.length / 2) : tiers.length;
  return (
    <dl
      className="grid grid-cols-[repeat(var(--tier-cols-mobile),minmax(0,1fr))] border-l border-t border-neutral-200 sm:grid-cols-[repeat(var(--tier-cols),minmax(0,1fr))]"
      style={{ "--tier-cols": tiers.length, "--tier-cols-mobile": mobileColumns } as CSSProperties}
    >
      {tiers.map((tier, index) => {
        const isLongest = showPerDay && index === tiers.length - 1 && tiers.length > 1;
        return (
          <div key={tier.label} className="border-b border-r border-neutral-200 px-1 py-2.5 text-center">
            <dt className="text-xs text-neutral-500">{tier.label}</dt>
            {regularPrices && (
              <dd className="mt-0.5 text-[11px] leading-none text-neutral-400 tabular-nums">
                <s>{formatMoney(rentalPriceCents(regularPrices, tier.maxDays), { whole: true })}</s>
              </dd>
            )}
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
