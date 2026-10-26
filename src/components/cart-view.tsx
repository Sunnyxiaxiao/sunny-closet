"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckoutForm } from "@/components/checkout-form";
import { localePath, type Locale } from "@/i18n/config";
import { removeFromCart, useCart } from "@/lib/cart";
import type { CartQuote, CartQuoteLine } from "@/lib/cart-quote";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getMessages, sizeLabel } from "@/messages";

const noop = () => () => {};

/** 购物车页：每一件的价格和可租情况（向 /api/cart 查询）、订单金额、结算表单。邮寄全美包邮，没有运费 */
export function CartView({
  locale,
  shippingMinDays,
  defaults,
}: {
  locale: Locale;
  /** 邮寄每件最短租几天（后台“价格”里设置） */
  shippingMinDays: number;
  defaults?: { name: string; email: string; phone: string; wechat: string };
}) {
  const messages = getMessages(locale);
  const t = messages.cart;
  const lines = useCart();
  // 购物车存在浏览器里，服务端渲染时还读不到：读到之前先显示“查询中”，不要闪一下“购物车是空的”
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [result, setResult] = useState<{ key: string; quote?: CartQuote; failed?: boolean } | null>(null);
  const [fulfillment, setFulfillment] = useState("pickup");

  const key = JSON.stringify([lines, locale]);
  useEffect(() => {
    if (lines.length === 0) return;
    const controller = new AbortController();
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, locale }),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("quote_failed");
        setResult({ key, quote: (await res.json()) as CartQuote });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, failed: true });
      });
    return () => controller.abort();
  }, [key, lines, locale]);

  if (!hydrated) return <p className="mt-8 text-neutral-500">{t.loading}</p>;

  if (lines.length === 0) {
    return (
      <div className="mt-10 text-center">
        <p className="text-neutral-600">{t.empty}</p>
        <Link
          href={localePath(locale, "/styles")}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
        >
          {t.browse}
        </Link>
      </div>
    );
  }

  const current = result?.key === key ? result : null;
  const quote = current?.quote ?? null;
  const shipping = fulfillment === "shipping";

  /** 这一件现在不能下单的原因（按所选取件方式） */
  const issueOf = (line: CartQuoteLine, q: CartQuote): string | null => {
    if (line.problem) return t.problems[line.problem];
    if (!line.pickupOk) return t.soldOut;
    if (!shipping) return null;
    if (line.rentalDays < shippingMinDays) return t.shippingTooShort(shippingMinDays);
    if (line.start < q.earliestShippingStart) {
      return t.shippingTooSoon(q.shippingLeadDays, formatShortDate(q.earliestShippingStart, locale));
    }
    if (!line.shippingOk) return t.shippingTaken;
    return null;
  };

  const valid = quote ? quote.lines.filter((l) => !l.problem) : [];
  const rentalCents = valid.reduce((sum, l) => sum + l.rentalCents, 0);
  const addOnCents = valid.reduce((sum, l) => sum + l.addOns.reduce((s, a) => s + a.cents, 0), 0);
  const depositCents = valid.reduce((sum, l) => sum + l.depositCents, 0);
  const datesDiffer =
    shipping && quote !== null && quote.lines.some((l) => l.start !== quote.lines[0].start || l.end !== quote.lines[0].end);
  const hasIssue = quote !== null && quote.lines.some((l) => issueOf(l, quote) !== null);
  const blocked = !quote ? t.loading : datesDiffer ? t.shippingDatesDiffer : hasIssue ? t.fixFirst : null;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <p className="text-sm text-neutral-500">{t.count(lines.length)}</p>
        {current?.failed && <p className="mt-4 text-sm text-red-600">{t.loadFailed}</p>}
        <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
          {lines.map((cartLine) => {
            const line = quote?.lines.find((l) => l.id === cartLine.id);
            const issue = line && quote ? issueOf(line, quote) : null;
            return (
              <li key={cartLine.id} className="flex gap-4 py-5">
                <div className="relative aspect-[3/5] w-20 shrink-0 overflow-hidden bg-neutral-100 sm:w-24">
                  {line?.style?.imageUrl && (
                    // 购物车的小图直接用存储桶里的缩略图
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.style.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  {line?.style ? (
                    <Link
                      href={localePath(locale, line.style.path)}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {[line.style.brand, line.style.name].filter(Boolean).join(" ")}
                    </Link>
                  ) : (
                    <p className="h-5 w-40 animate-pulse bg-neutral-100" />
                  )}
                  <p className="text-neutral-600">
                    {t.size} {sizeLabel(cartLine.size, locale)}
                  </p>
                  <p className="text-neutral-600">
                    {t.dates(formatDateRange(cartLine.start, cartLine.end, locale), line?.rentalDays ?? 0)}
                  </p>
                  {line && !line.problem && (
                    <p className="text-neutral-600">
                      {t.rental} {formatMoney(line.rentalCents)}
                      {line.depositCents > 0 && ` · ${t.deposit} ${formatMoney(line.depositCents)}`}
                    </p>
                  )}
                  {line?.addOns.map((a) => (
                    <p key={a.id} className="text-neutral-600">
                      {t.addOn(a.name)} · {formatMoney(a.cents)}
                    </p>
                  ))}
                  {issue && (
                    <p role="alert" className="font-semibold text-red-600">
                      {issue}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(cartLine.id)}
                  className="self-start text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
                >
                  {t.remove}
                </button>
              </li>
            );
          })}
        </ul>
        <Link href={localePath(locale, "/styles")} className="mt-4 inline-block text-sm underline underline-offset-4">
          ← {t.continueShopping}
        </Link>
      </section>

      <aside className="space-y-8">
        <section className="bg-neutral-50 p-4" aria-live="polite">
          <h2 className="text-base font-bold">{t.summary}</h2>
          {quote ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <SummaryRow label={t.rental} value={formatMoney(rentalCents)} />
              {addOnCents > 0 && <SummaryRow label={t.addOns} value={formatMoney(addOnCents)} />}
              {depositCents > 0 && <SummaryRow label={t.depositTotal} value={formatMoney(depositCents)} />}
              <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-base">
                <dt className="font-semibold">{t.total}</dt>
                <dd className="font-bold">{formatMoney(rentalCents + addOnCents + depositCents)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">{current?.failed ? t.loadFailed : t.loading}</p>
          )}
        </section>

        <CheckoutForm
          lines={lines}
          shippingMinDays={shippingMinDays}
          fulfillment={fulfillment}
          onFulfillmentChange={setFulfillment}
          blocked={blocked}
          defaults={defaults}
          locale={locale}
        />
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
