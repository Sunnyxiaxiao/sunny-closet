"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CHECKOUT_FORM_ID, CheckoutForm } from "@/components/checkout-form";
import { ConditionNoteBody } from "@/components/condition-notes";
import { localePath, type Locale } from "@/i18n/config";
import { removeFromCart, useCart } from "@/lib/cart";
import type { CartQuote, CartQuoteLine } from "@/lib/cart-quote";
import { formatDateRange, formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  qualifiesForFreeShipping,
  rushFeeCents,
  shippingFeeCents,
  shippingLines,
  shippingPolicyArgs,
  showFullLookTip,
} from "@/lib/shipping";
import { getMessages, sizeLabel } from "@/messages";

const noop = () => () => {};

/** 购物车页：每一件的价格和可租情况（向 /api/cart 查询）、订单金额（含邮寄运费）、结算表单 */
export function CartView({
  locale,
  shippingMinDays,
  defaults,
  payByCard,
}: {
  locale: Locale;
  /** 邮寄每件最短租几天（后台“价格”里设置） */
  shippingMinDays: number;
  defaults?: { name: string; email: string; phone: string; wechat: string };
  /** 配置了 Stripe：提交后直接刷卡付款 */
  payByCard: boolean;
}) {
  const messages = getMessages(locale);
  const t = messages.cart;
  const lines = useCart();
  // 购物车存在浏览器里，服务端渲染时还读不到：读到之前先显示“查询中”，不要闪一下“购物车是空的”
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [result, setResult] = useState<{ key: string; quote?: CartQuote; failed?: boolean; tooMany?: boolean } | null>(null);
  const [fulfillment, setFulfillment] = useState("pickup");
  const [shippingState, setShippingState] = useState("");
  // Shipping on short notice: "rush" (extra fee) or "wait" (the owner accepts first); "" = not chosen yet
  const [rush, setRush] = useState("");
  // Cart items whose condition notes the customer ticked as seen (the checkboxes belong to the checkout form)
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const toggleAck = (id: string, on: boolean) =>
    setAcknowledged((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

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
        if (!res.ok) throw new Error(res.status === 429 ? "too_many_requests" : "quote_failed");
        setResult({ key, quote: (await res.json()) as CartQuote });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setResult({ key, failed: true, tooMany: error.message === "too_many_requests" });
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
  // 运费和服务端用同一个函数算，提交时服务端会按数据库价格重算
  const forShipping = shippingLines(valid);
  const shippingCents = quote ? shippingFeeCents(forShipping, shippingState) : null;
  const freeShipping = qualifiesForFreeShipping(forShipping);
  const [, , freeSubtotal] = shippingPolicyArgs(shippingMinDays);
  // All shipped items share their dates, so the first one decides the notice
  const shortNotice =
    shipping && quote !== null && valid.length > 0 && valid[0].start >= quote.earliestShippingStart && valid[0].start < quote.shortNoticeBefore;
  const rushCents = shortNotice && rush === "rush" ? rushFeeCents(shippingState) : 0;
  const datesDiffer =
    shipping && quote !== null && quote.lines.some((l) => l.start !== quote.lines[0].start || l.end !== quote.lines[0].end);
  const hasIssue = quote !== null && quote.lines.some((l) => issueOf(l, quote) !== null);
  const unconfirmed = quote !== null && quote.lines.some((l) => l.conditionNotes.length > 0 && !acknowledged.has(l.id));
  const blocked = !quote
    ? t.loading
    : datesDiffer
      ? t.shippingDatesDiffer
      : hasIssue
        ? t.fixFirst
        : unconfirmed
          ? t.conditionConfirmFirst
          : shortNotice && rush === ""
            ? messages.checkout.chooseRush
            : null;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <p className="text-sm text-neutral-500">{t.count(lines.length)}</p>
        {current?.failed && <p className="mt-4 text-sm text-red-600">{current.tooMany ? t.tooManyRequests : t.loadFailed}</p>}
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
                      {t.addOn(a.size ? `${a.name} · ${sizeLabel(a.size, locale)}` : a.name)} · {formatMoney(a.cents)}
                    </p>
                  ))}
                  {issue && (
                    <p role="alert" className="font-semibold text-red-600">
                      {issue}
                    </p>
                  )}
                  {line && line.conditionNotes.length > 0 && (
                    <div className="mt-2 border border-amber-200 bg-amber-50 p-3">
                      <p className="font-semibold text-amber-900">{t.conditionNotice}</p>
                      <div className="mt-2 space-y-3">
                        {line.conditionNotes.map((note) => (
                          <ConditionNoteBody key={note.itemId} note={note} locale={locale} />
                        ))}
                      </div>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 font-medium text-neutral-900">
                        <input
                          type="checkbox"
                          form={CHECKOUT_FORM_ID}
                          name="conditionAck"
                          value={`${line.id}:${line.conditionDigest}`}
                          checked={acknowledged.has(line.id)}
                          onChange={(e) => toggleAck(line.id, e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
                        />
                        <span>{t.conditionConfirm}</span>
                      </label>
                      <p className="mt-1 text-xs text-neutral-600">{t.conditionAlternative}</p>
                    </div>
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
              {shipping && (
                <SummaryRow
                  label={t.shipping}
                  value={
                    !shippingCents
                      ? t.freeShipping
                      : freeShipping
                        ? t.farFreeShipping(formatMoney(shippingCents))
                        : formatMoney(shippingCents)
                  }
                />
              )}
              {rushCents > 0 && <SummaryRow label={messages.checkout.rushFee} value={formatMoney(rushCents)} />}
              <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-base">
                <dt className="font-semibold">{t.total}</dt>
                <dd className="font-bold">
                  {formatMoney(rentalCents + addOnCents + depositCents + (shipping ? (shippingCents ?? 0) + rushCents : 0))}
                </dd>
              </div>
              {shipping && !freeShipping && (
                <p className="pt-1 text-xs text-neutral-500">
                  {showFullLookTip(forShipping)
                    ? t.fullLookTip
                    : t.freeShippingHint(formatMoney(freeSubtotal * 100, { whole: true }))}
                </p>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">{current?.failed ? (current.tooMany ? t.tooManyRequests : t.loadFailed) : t.loading}</p>
          )}
        </section>

        <CheckoutForm
          lines={lines}
          shippingMinDays={shippingMinDays}
          fulfillment={fulfillment}
          onFulfillmentChange={setFulfillment}
          shippingState={shippingState}
          onShippingStateChange={setShippingState}
          shippingCents={shippingCents}
          shortNotice={shortNotice}
          rush={rush}
          onRushChange={setRush}
          rushCents={rushFeeCents(shippingState)}
          blocked={blocked}
          defaults={defaults}
          payByCard={payByCard}
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
