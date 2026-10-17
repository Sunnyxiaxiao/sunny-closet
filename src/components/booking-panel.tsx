"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { validateRentalRange } from "@/lib/booking/rules";
import { formatShortDateZh, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { calculateQuote, type Quote } from "@/lib/pricing";
import { rangeErrorMessages } from "@/lib/validation/rental-query";

interface SizeAvailability {
  size: string;
  total: number;
  available: number;
}

type AvailabilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; sizes: SizeAvailability[] }
  | { status: "error"; message: string };

export interface BookingSelection {
  start: IsoDate;
  end: IsoDate;
  size: string;
  quote: Quote;
}

export function BookingPanel({
  styleId,
  dailyPriceCents,
  depositCents,
  sizes,
  today,
  maxRentalDays,
  bufferDays,
  initial,
  renderCheckout,
}: {
  styleId: string;
  dailyPriceCents: number;
  depositCents: number;
  sizes: SizeAvailability[];
  today: IsoDate;
  maxRentalDays: number;
  bufferDays: number;
  initial: { start?: string; end?: string; size?: string };
  /** 选好且有货时渲染的下一步（预订表单） */
  renderCheckout?: (selection: BookingSelection) => ReactNode;
}) {
  const singleSize = sizes.length === 1 ? sizes[0].size : null;
  const [start, setStart] = useState(initial.start ?? "");
  const [end, setEnd] = useState(initial.end ?? "");
  const [size, setSize] = useState(
    singleSize ?? (initial.size && sizes.some((s) => s.size === initial.size) ? initial.size : ""),
  );
  const [result, setResult] = useState<{ query: string; state: AvailabilityState } | null>(null);

  const rangeError = validateRentalRange({ start, end }, { today, maxRentalDays });
  const rangeValid = rangeError === null;
  const query = rangeValid ? new URLSearchParams({ styleId, start, end }).toString() : null;

  const availability: AvailabilityState = !query
    ? { status: "idle" }
    : result?.query === query
      ? result.state
      : { status: "loading" };

  const quote = useMemo(
    () => (rangeValid ? calculateQuote({ start, end, dailyPriceCents, depositCents }) : null),
    [rangeValid, start, end, dailyPriceCents, depositCents],
  );

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "查询失败");
        setResult({ query, state: { status: "ok", sizes: body.sizes } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          query,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : "查询失败，请稍后再试",
          },
        });
      });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ start, end, size: singleSize ? "" : size })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [start, end, size, singleSize]);

  const availableFor = (s: string) =>
    availability.status === "ok"
      ? (availability.sizes.find((x) => x.size === s)?.available ?? 0)
      : null;

  const selectedAvailable = size ? availableFor(size) : null;

  function onStartChange(value: string) {
    setStart(value);
    if (value && (!end || end < value)) setEnd(value);
  }

  const showRangeHint = Boolean(start || end) && rangeError;

  const dateInputClass =
    "h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

  return (
    <div className="space-y-6">
      {singleSize ? (
        <p className="text-sm">
          <span className="text-neutral-500">尺码</span>
          <span className="ml-3 inline-flex min-w-12 justify-center border border-neutral-900 px-3 py-1.5 font-semibold">
            {singleSize}
          </span>
        </p>
      ) : (
        <fieldset>
          <legend className="text-sm text-neutral-500">
            尺码{size ? <span className="ml-2 font-semibold text-neutral-900">{size}</span> : null}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => {
              const soldOut = availableFor(s.size) === 0;
              const selected = size === s.size;
              return (
                <button
                  key={s.size}
                  type="button"
                  onClick={() => setSize(s.size)}
                  aria-pressed={selected}
                  className={[
                    "min-w-14 border px-4 py-2.5 text-sm font-semibold transition",
                    selected
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white hover:border-neutral-900",
                    soldOut && !selected ? "border-dashed text-neutral-400 line-through" : "",
                  ].join(" ")}
                >
                  {s.size}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-sm text-neutral-500">租用日期</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            取件日期
            <input
              type="date"
              value={start}
              min={today}
              onChange={(e) => onStartChange(e.target.value)}
              className={dateInputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            归还日期
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
            {rangeError === "too_long"
              ? `租期最长 ${maxRentalDays} 天`
              : rangeErrorMessages[rangeError]}
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          取件日和归还日都计入租期。每次归还后需 {bufferDays} 天清洁整理。
        </p>
      </fieldset>

      <div className="bg-neutral-50 p-4" aria-live="polite">
        {quote ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">
                租金（{formatShortDateZh(start)} – {formatShortDateZh(end)}，{quote.rentalDays} 天 ×{" "}
                {formatMoney(quote.dailyPriceCents)}）
              </dt>
              <dd className="font-medium">{formatMoney(quote.rentalCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">押金（归还后退还）</dt>
              <dd className="font-medium">{formatMoney(quote.depositCents)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-base">
              <dt className="font-semibold">合计</dt>
              <dd className="font-bold">{formatMoney(quote.totalCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">选择日期后显示总价。</p>
        )}

        <div className="mt-3 text-sm">
          {!rangeValid || !size ? (
            <p className="text-neutral-500">
              {singleSize ? "选择日期后查看这段时间是否可租。" : "选择日期和尺码后查看是否有货。"}
            </p>
          ) : availability.status === "loading" ? (
            <p className="text-neutral-500">正在查询…</p>
          ) : availability.status === "error" ? (
            <p className="text-red-600">{availability.message}</p>
          ) : selectedAvailable && selectedAvailable > 0 ? (
            <p className="font-semibold text-emerald-700">
              ✓ {singleSize ? "这段时间可租" : "有货：该尺码这段时间可租"}
            </p>
          ) : (
            <p className="font-semibold text-red-600">
              ✗ {singleSize ? "这段时间已被预订，换个日期试试" : "该尺码这段时间已租满，换个日期或尺码试试"}
            </p>
          )}
        </div>
      </div>

      {quote && size && selectedAvailable !== null && selectedAvailable > 0 && renderCheckout
        ? renderCheckout({ start, end, size, quote })
        : null}
    </div>
  );
}
