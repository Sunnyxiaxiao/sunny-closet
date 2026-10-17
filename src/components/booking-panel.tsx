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
  const [start, setStart] = useState(initial.start ?? "");
  const [end, setEnd] = useState(initial.end ?? "");
  const [size, setSize] = useState(
    initial.size && sizes.some((s) => s.size === initial.size) ? initial.size : "",
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
    for (const [key, value] of Object.entries({ start, end, size })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [start, end, size]);

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

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">1. 选择日期</legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">取件日期</span>
            <input
              type="date"
              value={start}
              min={today}
              onChange={(e) => onStartChange(e.target.value)}
              className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">归还日期</span>
            <input
              type="date"
              value={end}
              min={start || today}
              onChange={(e) => setEnd(e.target.value)}
              className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-base"
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
        <p className="mt-2 text-xs text-slate-500">
          取件日和归还日都计入租期。每次归还后需 {bufferDays} 天清洁整理。
        </p>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">2. 选择尺码</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sizes.map((s) => {
            const count = availableFor(s.size);
            const soldOut = count === 0;
            const selected = size === s.size;
            return (
              <button
                key={s.size}
                type="button"
                onClick={() => setSize(s.size)}
                aria-pressed={selected}
                className={[
                  "min-w-14 rounded-xl border px-4 py-2.5 text-base font-medium transition",
                  selected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:border-brand-500",
                  soldOut && !selected ? "border-dashed text-slate-400 line-through" : "",
                ].join(" ")}
              >
                {s.size}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-2xl bg-slate-50 p-4" aria-live="polite">
        {quote ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">
                租金（{formatShortDateZh(start)} – {formatShortDateZh(end)}，{quote.rentalDays} 天 ×{" "}
                {formatMoney(quote.dailyPriceCents)}）
              </dt>
              <dd className="font-medium">{formatMoney(quote.rentalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">押金（归还后退还）</dt>
              <dd className="font-medium">{formatMoney(quote.depositCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-semibold">合计</dt>
              <dd className="font-bold text-brand-700">{formatMoney(quote.totalCents)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">
            日租 {formatMoney(dailyPriceCents)} · 押金 {formatMoney(depositCents)}。选择日期后显示总价。
          </p>
        )}

        <div className="mt-3 text-sm">
          {!rangeValid || !size ? (
            <p className="text-slate-500">选择日期和尺码后查看是否有货。</p>
          ) : availability.status === "loading" ? (
            <p className="text-slate-500">正在查询库存…</p>
          ) : availability.status === "error" ? (
            <p className="text-red-600">{availability.message}</p>
          ) : selectedAvailable && selectedAvailable > 0 ? (
            <p className="font-medium text-emerald-700">✓ 有货：该尺码这段时间可租</p>
          ) : (
            <p className="font-medium text-red-600">✗ 该尺码这段时间已租满，换个日期或尺码试试</p>
          )}
        </div>
      </div>

      {quote && size && selectedAvailable !== null && selectedAvailable > 0 && renderCheckout
        ? renderCheckout({ start, end, size, quote })
        : null}
    </div>
  );
}
