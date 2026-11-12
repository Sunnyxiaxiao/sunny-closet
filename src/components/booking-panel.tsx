"use client";

import Link from "@/components/storefront-link";
import { useEffect, useState } from "react";
import { CompleteTheLook } from "@/components/complete-the-look";
import { earliestShippingStart, validateRentalRange, type FulfillmentPaddings } from "@/lib/booking/rules";
import { localePath, type Locale } from "@/i18n/config";
import { addToCart, MAX_CART_LINES } from "@/lib/cart";
import { contactLinks } from "@/lib/contact";
import { handoverText } from "@/lib/booking/schedule";
import { addDays, formatDateRange, formatShortDate, isIsoDate, type IsoDate } from "@/lib/dates";
import type { AddOnOption, GlovesAddOnOption } from "@/lib/helmet-covers";
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

/**
 * 加购配件在这段时间的可租件数，分到店自取和邮寄：头盔套按款式（款式 id → 件数），手套按颜色 · 尺码（款式 id → 尺码 → 件数）。
 * 查询失败时为 null，交给提交时的服务端校验
 */
type AddOnCounts = {
  pickup: Record<string, number>;
  shipping: Record<string, number>;
  pickupSizes: Record<string, Record<string, number>>;
  shippingSizes: Record<string, Record<string, number>>;
} | null;

export function BookingPanel({
  styleId: jacketStyleId,
  rentalPricesCents: jacketPricesCents,
  shippingMinDays,
  depositCents: jacketDepositCents,
  pantsOption,
  sizes,
  today,
  maxRentalDays,
  paddings,
  initial,
  hideSize,
  choiceLabel,
  onSizeChange,
  addOnOptions = [],
  glovesOptions = [],
  separate = false,
  initialAddOnSlug,
  productName,
  locale,
}: {
  styleId: string;
  rentalPricesCents: number[];
  shippingMinDays: number;
  depositCents: number;
  /**
   * 只有上衣的款式：可以选“加一条黑色滑雪裤”，按这个套装的价格和押金下单（套装占用的就是这件上衣）。
   * 默认只租上衣
   */
  pantsOption?: { styleId: string; rentalPricesCents: number[]; depositCents: number };
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
  /** 可加购的手套（有库存的颜色 · 尺码）；为空时不显示 */
  glovesOptions?: GlovesAddOnOption[];
  /** 单件上衣或裤子：要上下装都租才能用加购价，选了加购时提醒一句 */
  separate?: boolean;
  /** 从头盔套 / 手套页点“搭配雪服一起租”过来时预先选中的那一款 */
  initialAddOnSlug?: string;
  /** 商品名：写进“问尺码 / 有空档通知我”的短信和邮件里 */
  productName: string;
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.bookingPanel;
  const label = choiceLabel ?? messages.product.size;
  const singleSize = sizes.length === 1 ? sizes[0].size : null;
  const [withPants, setWithPants] = useState(false);
  const chosen = withPants && pantsOption ? pantsOption : null;
  const styleId = chosen?.styleId ?? jacketStyleId;
  const rentalPricesCents = chosen?.rentalPricesCents ?? jacketPricesCents;
  const depositCents = chosen?.depositCents ?? jacketDepositCents;
  const [start, setStart] = useState(initial.start ?? "");
  const [end, setEnd] = useState(initial.end ?? "");
  const [size, setSize] = useState(
    singleSize ?? (initial.size && sizes.some((s) => s.size === initial.size) ? initial.size : ""),
  );
  const [result, setResult] = useState<{ query: string; state: AvailabilityState } | null>(null);
  const [addOnId, setAddOnId] = useState<string | null>(
    addOnOptions.find((o) => o.slug === initialAddOnSlug)?.id ?? null,
  );
  const [gloves, setGloves] = useState<{ id: string; size: string | null } | null>(() => {
    const option = glovesOptions.find((o) => o.slug === initialAddOnSlug);
    return option ? { id: option.id, size: option.sizes.length === 1 ? option.sizes[0] : null } : null;
  });
  const [addOnResult, setAddOnResult] = useState<{ query: string; counts: AddOnCounts } | null>(null);
  // 刚加入购物车的是哪一个选择（款式、尺码、日期、加购都没变时显示“已加入”）
  const [addedKey, setAddedKey] = useState<string | null>(null);
  const [cartFull, setCartFull] = useState(false);

  const rangeError = validateRentalRange({ start, end }, { today, maxRentalDays });
  const rangeValid = rangeError === null;
  const hasAddOns = addOnOptions.length + glovesOptions.length > 0;
  const query = rangeValid
    ? new URLSearchParams({ styleId, start, end, ...(hasAddOns ? { includeAddOns: "1" } : {}) }).toString()
    : null;

  const availability: AvailabilityState = !query
    ? { status: "idle" }
    : result?.query === query
      ? result.state
      : { status: "loading" };

  const dateQuery = rangeValid ? new URLSearchParams({ start, end }).toString() : null;
  const wantsAddOnCounts = hasAddOns && dateQuery !== null;
  // 还没选日期 / 正在查询：null（卡片都可点）；查到后按件数标记已订满
  const addOnCounts: AddOnCounts =
    wantsAddOnCounts && addOnResult?.query === dateQuery ? addOnResult.counts : null;
  const addOnLoading = wantsAddOnCounts && addOnResult?.query !== dateQuery;
  const selectedAddOn = addOnOptions.find((o) => o.id === addOnId);
  // 选中的头盔套这段时间被订满时不计入价格，也不提交
  const selectedAddOnUnavailable =
    selectedAddOn !== undefined && addOnCounts !== null && (addOnCounts.pickup[selectedAddOn.id] ?? 0) === 0;
  // 手套：选了款式还要选颜色 · 尺码；这段时间那个尺码被订满时同样不计价、不提交
  const selectedGloves = glovesOptions.find((o) => o.id === gloves?.id);
  const glovesSize = selectedGloves ? (gloves?.size ?? null) : null;
  const selectedGlovesUnavailable =
    selectedGloves !== undefined &&
    glovesSize !== null &&
    addOnCounts !== null &&
    (addOnCounts.pickupSizes[selectedGloves.id]?.[glovesSize] ?? 0) === 0;
  const addOns: { id: string; name: string; addOnCents: number; size: string | null }[] = [
    ...(selectedAddOn && !selectedAddOnUnavailable ? [{ ...selectedAddOn, size: null }] : []),
    ...(selectedGloves && glovesSize && !selectedGlovesUnavailable ? [{ ...selectedGloves, size: glovesSize }] : []),
  ];
  const glovesSizeMissing = selectedGloves !== undefined && glovesSize === null;

  const selectionKey = JSON.stringify([styleId, size, start, end, addOns.map((a) => [a.id, a.size])]);

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
    // Date inputs often change together. Don't send requests for intermediate selections.
    const timer = setTimeout(() => {
      fetch(`/api/availability?${query}`, { signal: controller.signal, cache: "no-store" })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(t.queryFailed);
          setResult({ query, state: { status: "ok", sizes: body.sizes } });
          if (hasAddOns && dateQuery) {
            setAddOnResult({ query: dateQuery, counts: {
              pickup: body.counts, shipping: body.shippingCounts,
              pickupSizes: body.sizeCounts, shippingSizes: body.shippingSizeCounts,
            } });
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ query, state: {
            status: "error", message: error instanceof Error ? error.message : t.queryFailed,
          } });
          if (hasAddOns && dateQuery) setAddOnResult({ query: dateQuery, counts: null });
        });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, dateQuery, hasAddOns, t.queryFailed]);

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
  const shippingAddOnsFree = addOns.every((a) =>
    a.size === null ? (addOnCounts?.shipping[a.id] ?? 1) > 0 : (addOnCounts?.shippingSizes[a.id]?.[a.size] ?? 1) > 0,
  );

  function onStartChange(value: string) {
    setStart(value);
    if (value && (!end || end < value)) setEnd(value);
  }

  const showRangeHint = Boolean(start || end) && rangeError;

  // 只在选衣服尺码时提示可以来问（头盔套、手套选的是颜色）
  const sizeHelp = choiceLabel ? null : (
    <ContactPrompt
      text={t.sizeHelp}
      links={contactLinks(t.sizeHelpSubject(productName), t.sizeHelpBody(productName))}
      labels={t}
    />
  );

  const dateInputClass =
    "h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

  const choiceClass = (selected: boolean) =>
    [
      "flex-1 border px-4 py-2.5 text-left text-sm transition",
      selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:border-neutral-900",
    ].join(" ");

  return (
    <div className="space-y-6">
      {pantsOption && (
        <fieldset>
          <legend className="text-sm text-neutral-500">{t.pantsLabel}</legend>
          <div className="mt-2 flex gap-2">
            {[
              { value: false, label: t.jacketOnly, cents: jacketPricesCents[0] },
              { value: true, label: t.withPants, cents: pantsOption.rentalPricesCents[0] },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setWithPants(option.value)}
                aria-pressed={withPants === option.value}
                className={choiceClass(withPants === option.value)}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className={withPants === option.value ? "text-neutral-300" : "text-neutral-500"}>
                  {messages.product.rentFrom.prefix} {formatMoney(option.cents, { whole: true })}
                  {messages.product.rentFrom.suffix && ` ${messages.product.rentFrom.suffix}`}
                </span>
              </button>
            ))}
          </div>
          {withPants && <p className="mt-2 text-xs text-neutral-500">{t.withPantsNote}</p>}
        </fieldset>
      )}
      {hideSize ? null : singleSize ? (
        <div>
          <p className="text-sm">
            <span className="text-neutral-500">{label}</span>
            <span className="ml-3 inline-flex min-w-12 justify-center border border-neutral-900 px-3 py-1.5 font-semibold">
              {sizeLabel(singleSize, locale)}
            </span>
          </p>
          {sizeHelp}
        </div>
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
          {sizeHelp}
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
              max={isIsoDate(start) ? addDays(start, maxRentalDays - 1) : undefined}
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

      {glovesOptions.length > 0 && (
        <CompleteTheLook
          kind="gloves"
          options={glovesOptions}
          selectedId={gloves?.id ?? null}
          onSelect={(id) => {
            const option = glovesOptions.find((o) => o.id === id);
            setGloves(option ? { id: option.id, size: option.sizes.length === 1 ? option.sizes[0] : null } : null);
          }}
          availableCounts={addOnCounts?.pickup ?? null}
          locale={locale}
        >
          {selectedGloves && selectedGloves.sizes.length > 1 && (
            <fieldset className="mt-3">
              <legend className="text-xs text-neutral-500">{messages.gloves.pickSize}</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {selectedGloves.sizes.map((s) => {
                  const soldOut = addOnCounts !== null && (addOnCounts.pickupSizes[selectedGloves.id]?.[s] ?? 0) === 0;
                  const chosen = glovesSize === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={soldOut}
                      aria-pressed={chosen}
                      onClick={() => setGloves({ id: selectedGloves.id, size: s })}
                      className={[
                        "border px-3 py-1.5 text-xs font-semibold transition",
                        chosen ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:border-neutral-900",
                        soldOut ? "cursor-not-allowed border-dashed text-neutral-400 line-through" : "",
                      ].join(" ")}
                    >
                      {sizeLabel(s, locale)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </CompleteTheLook>
      )}

      {separate && !withPants && (selectedAddOn || selectedGloves) && (
        <p className="text-xs text-neutral-500">{t.addOnNeedsOutfit}</p>
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
                <dt className="text-neutral-600">
                  {t.addOnLine(addOn.size ? `${addOn.name} · ${sizeLabel(addOn.size, locale)}` : addOn.name)}
                </dt>
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
        {selectedGlovesUnavailable && (
          <p className="mt-3 text-sm text-amber-700">{messages.gloves.selectedUnavailable}</p>
        )}
        {glovesSizeMissing && <p className="mt-3 text-sm text-amber-700">{messages.gloves.chooseSize}</p>}

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
            <>
              <p className="font-semibold text-red-600">
                ✗ {singleSize ? t.unavailableSingle : t.unavailableChoice(label)}
              </p>
              <ContactPrompt
                text={t.notifyHelp}
                links={contactLinks(
                  t.notifySubject(productName),
                  t.notifyBody(productName, hideSize ? null : sizeLabel(size, locale), formatDateRange(start, end, locale)),
                )}
                labels={t}
              />
            </>
          )}
        </div>
      </div>

      {quote && size && selectedAvailable !== null && selectedAvailable > 0 ? (
        <div className="space-y-3">
          {addedKey === selectionKey ? (
            <div className="space-y-3 border border-neutral-900 p-4" role="status">
              <p className="text-sm font-semibold">✓ {t.added}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={localePath(locale, "/cart")}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
                >
                  {t.viewCart}
                </Link>
                <Link
                  href={localePath(locale, "/styles")}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-neutral-900 text-sm font-bold tracking-wider hover:bg-neutral-100"
                >
                  {t.keepShopping}
                </Link>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={(addOnLoading && (addOnId !== null || gloves !== null)) || glovesSizeMissing}
              onClick={() => {
                const ok = addToCart({
                  styleId,
                  size,
                  start,
                  end,
                  addOnIds: addOns.map((a) => a.id),
                  addOnSizes: addOns.map((a) => a.size),
                });
                setCartFull(!ok);
                if (ok) setAddedKey(selectionKey);
              }}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.addToCart}
            </button>
          )}
          {cartFull && <p className="text-sm font-semibold text-amber-700">{t.cartFull(MAX_CART_LINES)}</p>}
          {/* 取件方式在结算时选；这里先提醒这次能不能邮寄 */}
          {quote.rentalDays < shippingMinDays ? (
            <p className="text-xs text-neutral-500">{messages.checkout.shippingTooShort(shippingMinDays)}</p>
          ) : shippingTooSoon ? (
            <p className="text-xs text-neutral-500">
              {t.shippingTooSoon(paddings.shipping.leadDays, formatShortDate(earliestShippingStart(today, paddings), locale))}
            </p>
          ) : !shippingSizeFree || !shippingAddOnsFree ? (
            <p className="text-xs text-neutral-500">{t.shippingTaken(paddings.shipping.leadDays)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 一句提示 + “发短信 / 发邮件”，点开顾客自己的短信或邮件应用，内容已经写好 */
function ContactPrompt({
  text,
  links,
  labels,
}: {
  text: string;
  links: { sms: string; email: string };
  labels: { textUs: string; emailUs: string };
}) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-neutral-500">
      {text}{" "}
      <a href={links.sms} className="font-semibold text-neutral-900 underline underline-offset-2">
        {labels.textUs}
      </a>
      {" · "}
      <a href={links.email} className="font-semibold text-neutral-900 underline underline-offset-2">
        {labels.emailUs}
      </a>
    </p>
  );
}
