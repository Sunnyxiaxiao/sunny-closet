"use client";

import { useEffect, useState } from "react";
import { CheckoutForm } from "@/components/checkout-form";
import { CompleteTheLook } from "@/components/complete-the-look";
import { earliestShippingStart, validateRentalRange, type FulfillmentPaddings } from "@/lib/booking/rules";
import type { Locale } from "@/i18n/config";
import { handoverText } from "@/lib/booking/schedule";
import { formatDateRange, formatShortDate, type IsoDate } from "@/lib/dates";
import type { AddOnOption } from "@/lib/helmet-covers";
import { formatMoney } from "@/lib/money";
import { calculateQuote } from "@/lib/pricing";
import { getMessages, sizeLabel } from "@/messages";

interface SizeAvailability {
  size: string;
  total: number;
  /** 到店自取可租件数 */
  available: number;
  /** 邮寄可租件数（要提前寄出、晚些回来，占用更久）；首屏未查日期时没有 */
  shippingAvailable?: number;
}

type AvailabilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; sizes: SizeAvailability[] }
  | { status: "error"; message: string };

/** 加购头盔套在这段时间的可租件数（款式 id → 件数），分到店自取和邮寄；查询失败时为 null，交给提交时的服务端校验 */
type AddOnCounts = { pickup: Record<string, number>; shipping: Record<string, number> } | null;

export function BookingPanel({
  styleId,
  rentalPricesCents,
  shippingMinDays,
  depositCents,
  sizes,
  today,
  maxRentalDays,
  paddings,
  initial,
  hideSize,
  choiceLabel,
  onSizeChange,
  addOnOptions = [],
  initialAddOnSlug,
  customer,
  locale,
}: {
  styleId: string;
  rentalPricesCents: number[];
  shippingMinDays: number;
  depositCents: number;
  sizes: SizeAvailability[];
  today: IsoDate;
  maxRentalDays: number;
  /** 到店自取 / 邮寄在滑雪日前后各占用几天（不收费） */
  paddings: FulfillmentPaddings;
  initial: { start?: string; end?: string; size?: string };
  /** 不显示尺码（头盔套只有均码） */
  hideSize?: boolean;
  /** 选项的叫法，默认「尺码」。头盔套按颜色区分时传「颜色」 */
  choiceLabel?: string;
  /** 选中的尺码 / 颜色变了。用来切换对应的商品图 */
  onSizeChange?: (size: string) => void;
  /** 可加购的头盔套；为空时不显示“Complete the Look” */
  addOnOptions?: AddOnOption[];
  /** 从头盔套页点“搭配雪服一起租”过来时预先选中的头盔套 */
  initialAddOnSlug?: string;
  /** 登录的顾客：下单表单预先填好的联系方式 */
  customer?: { name: string; email: string; phone: string; wechat: string };
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.bookingPanel;
  const label = choiceLabel ?? messages.product.size;
  const singleSize = sizes.length === 1 ? sizes[0].size : null;
  const [start, setStart] = useState(initial.start ?? "");
  const [end, setEnd] = useState(initial.end ?? "");
  const [size, setSize] = useState(
    singleSize ?? (initial.size && sizes.some((s) => s.size === initial.size) ? initial.size : ""),
  );
  const [result, setResult] = useState<{ query: string; state: AvailabilityState } | null>(null);
  const [addOnId, setAddOnId] = useState<string | null>(
    addOnOptions.find((o) => o.slug === initialAddOnSlug)?.id ?? null,
  );
  const [addOnResult, setAddOnResult] = useState<{ query: string; counts: AddOnCounts } | null>(null);

  const rangeError = validateRentalRange({ start, end }, { today, maxRentalDays });
  const rangeValid = rangeError === null;
  const query = rangeValid ? new URLSearchParams({ styleId, start, end }).toString() : null;

  const availability: AvailabilityState = !query
    ? { status: "idle" }
    : result?.query === query
      ? result.state
      : { status: "loading" };

  const dateQuery = rangeValid ? new URLSearchParams({ start, end }).toString() : null;
  const wantsAddOnCounts = addOnOptions.length > 0 && dateQuery !== null;
  // 还没选日期 / 正在查询：null（卡片都可点）；查到后按件数标记已订满
  const addOnCounts: AddOnCounts =
    wantsAddOnCounts && addOnResult?.query === dateQuery ? addOnResult.counts : null;
  const addOnLoading = wantsAddOnCounts && addOnResult?.query !== dateQuery;
  const selectedAddOn = addOnOptions.find((o) => o.id === addOnId);
  // 选中的头盔套这段时间被订满时不计入价格，也不提交
  const selectedAddOnUnavailable =
    selectedAddOn !== undefined && addOnCounts !== null && (addOnCounts.pickup[selectedAddOn.id] ?? 0) === 0;
  const addOns = selectedAddOn && !selectedAddOnUnavailable ? [selectedAddOn] : [];

  const quote = rangeValid
    ? calculateQuote({
        start,
        end,
        rentalPricesCents,
        depositCents,
        addOnPricesCents: addOns.map((a) => a.addOnCents),
      })
    : null;

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(t.queryFailed);
        setResult({ query, state: { status: "ok", sizes: body.sizes } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          query,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : t.queryFailed,
          },
        });
      });
    return () => controller.abort();
  }, [query, t.queryFailed]);

  useEffect(() => {
    if (!wantsAddOnCounts || !dateQuery) return;
    const controller = new AbortController();
    fetch(`/api/availability?${dateQuery}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setAddOnResult({ query: dateQuery, counts: { pickup: body.counts, shipping: body.shippingCounts } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAddOnResult({ query: dateQuery, counts: null });
      });
    return () => controller.abort();
  }, [wantsAddOnCounts, dateQuery]);

  useEffect(() => {
    onSizeChange?.(size);
  }, [size, onSizeChange]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const addon = addOnOptions.find((o) => o.id === addOnId)?.slug ?? "";
    for (const [key, value] of Object.entries({ start, end, size: singleSize ? "" : size, addon })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [start, end, size, singleSize, addOnId, addOnOptions]);

  const availableFor = (s: string) =>
    availability.status === "ok"
      ? (availability.sizes.find((x) => x.size === s)?.available ?? 0)
      : null;

  const selectedAvailable = size ? availableFor(size) : null;
  // 邮寄是否可行：要来得及提前寄出，且邮寄的占用时间段里这件（和加购的头盔套）也空着
  const shippingTooSoon = rangeValid && start < earliestShippingStart(today, paddings);
  const shippingSizeFree =
    availability.status === "ok"
      ? (availability.sizes.find((x) => x.size === size)?.shippingAvailable ?? 0) > 0
      : true;
  const shippingAddOnsFree = addOns.every((a) => (addOnCounts?.shipping[a.id] ?? 1) > 0);

  function onStartChange(value: string) {
    setStart(value);
    if (value && (!end || end < value)) setEnd(value);
  }

  const showRangeHint = Boolean(start || end) && rangeError;

  const dateInputClass =
    "h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

  return (
    <div className="space-y-6">
      {hideSize ? null : singleSize ? (
        <p className="text-sm">
          <span className="text-neutral-500">{label}</span>
          <span className="ml-3 inline-flex min-w-12 justify-center border border-neutral-900 px-3 py-1.5 font-semibold">
            {sizeLabel(singleSize, locale)}
          </span>
        </p>
      ) : (
        <fieldset>
          <legend className="text-sm text-neutral-500">
            {label}
            {size ? <span className="ml-2 font-semibold text-neutral-900">{sizeLabel(size, locale)}</span> : null}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => {
              const soldOut = availableFor(s.size) === 0;
              const selected = size === s.size;
              return (
                <button
                  key={s.size}
                  type="button"
                  onClick={() => {
                    setSize(s.size);
                    onSizeChange?.(s.size);
                  }}
                  aria-pressed={selected}
                  className={[
                    "min-w-14 border px-4 py-2.5 text-sm font-semibold transition",
                    selected
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white hover:border-neutral-900",
                    soldOut && !selected ? "border-dashed text-neutral-400 line-through" : "",
                  ].join(" ")}
                >
                  {sizeLabel(s.size, locale)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-sm text-neutral-500">{t.dates}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            {t.firstDay}
            <input
              type="date"
              value={start}
              min={today}
              onChange={(e) => onStartChange(e.target.value)}
              className={dateInputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            {t.lastDay}
            <input
              type="date"
              value={end}
              min={start || today}
              onChange={(e) => setEnd(e.target.value)}
              className={dateInputClass}
            />
          </label>
        </div>
        {showRangeHint && (
          <p className="mt-2 text-sm text-amber-700">
            {rangeError === "too_long" ? t.tooLong(maxRentalDays) : messages.rangeErrors[rangeError]}
          </p>
        )}
        {rangeValid ? (
          <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
            <li>
              {messages.fulfillment.pickup}
              {locale === "en" ? ": " : "："}
              {handoverText({ start, end }, "pickup", paddings.pickup, locale)}
            </li>
            <li>
              {messages.fulfillment.shipping}
              {locale === "en" ? ": " : "："}
              {handoverText({ start, end }, "shipping", paddings.shipping, locale)}
            </li>
            <li>{t.freeHandover}</li>
          </ul>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">{messages.product.rentalDaysHint}</p>
        )}
      </fieldset>

      {addOnOptions.length > 0 && (
        <CompleteTheLook
          options={addOnOptions}
          selectedId={addOnId}
          onSelect={setAddOnId}
          availableCounts={addOnCounts?.pickup ?? null}
          locale={locale}
        />
      )}

      <div className="bg-neutral-50 p-4" aria-live="polite">
        {quote ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">
                {t.rentalLine(formatDateRange(start, end, locale), quote.rentalDays)}
              </dt>
              <dd className="font-medium">{formatMoney(quote.rentalCents)}</dd>
            </div>
            {addOns.map((addOn) => (
              <div key={addOn.id} className="flex justify-between gap-3">
                <dt className="text-neutral-600">{t.addOnLine(addOn.name)}</dt>
                <dd className="font-medium">{formatMoney(addOn.addOnCents)}</dd>
              </div>
            ))}
            {quote.depositCents > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-600">{t.deposit}</dt>
                <dd className="font-medium">{formatMoney(quote.depositCents)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-base">
              <dt className="font-semibold">{t.total}</dt>
              <dd className="font-bold">{formatMoney(quote.totalCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">{t.pickDates}</p>
        )}

        {selectedAddOnUnavailable && (
          <p className="mt-3 text-sm text-amber-700">{messages.helmet.selectedUnavailable}</p>
        )}

        <div className="mt-3 text-sm">
          {!rangeValid || !size ? (
            <p className="text-neutral-500">
              {singleSize ? t.checkSingle : t.checkChoice(label)}
            </p>
          ) : availability.status === "loading" ? (
            <p className="text-neutral-500">{t.loading}</p>
          ) : availability.status === "error" ? (
            <p className="text-red-600">{availability.message}</p>
          ) : selectedAvailable && selectedAvailable > 0 ? (
            <p className="font-semibold text-emerald-700">
              ✓ {singleSize ? t.availableSingle : t.availableChoice(label)}
            </p>
          ) : (
            <p className="font-semibold text-red-600">
              ✗ {singleSize ? t.unavailableSingle : t.unavailableChoice(label)}
            </p>
          )}
        </div>
      </div>

      {quote && size && selectedAvailable !== null && selectedAvailable > 0 ? (
        <CheckoutForm
          styleId={styleId}
          selection={{ start, end, size, quote }}
          shippingMinDays={shippingMinDays}
          addOnIds={addOns.map((a) => a.id)}
          addOnPending={addOnLoading && addOnId !== null}
          shippingBlocked={
            shippingTooSoon
              ? t.shippingTooSoon(
                  paddings.shipping.leadDays,
                  formatShortDate(earliestShippingStart(today, paddings), locale),
                )
              : !shippingSizeFree || !shippingAddOnsFree
                ? t.shippingTaken(paddings.shipping.leadDays)
                : null
          }
          defaults={customer}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
