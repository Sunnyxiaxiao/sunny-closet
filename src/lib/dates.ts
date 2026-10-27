/**
 * Pure date utilities. Every date is a "YYYY-MM-DD" string with no time and no time zone.
 * Arithmetic uses UTC only and never the local time zone, so DST / time zones can't shift a date by one day.
 */

export type IsoDate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function toUtcMs(date: IsoDate): number {
  const match = ISO_DATE_RE.exec(date);
  if (!match) throw new Error(`无效日期：${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whether this is a real calendar date (e.g. 2026-02-30 returns false). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  return fromUtcMs(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Number of days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today's date in the given time zone. The only place that touches the real clock. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** E.g. "2026年1月10日（周六）" */
export function formatDateZh(date: IsoDate): string {
  const d = new Date(toUtcMs(date));
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS_ZH[d.getUTCDay()]}）`;
}

/** E.g. "1月10日" */
export function formatShortDateZh(date: IsoDate): string {
  const d = new Date(toUtcMs(date));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

const EN_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const EN_LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats a date for the locale. Chinese: "2026年1月10日（周六）"; English: "Sat, Jan 10, 2026" */
export function formatDate(date: IsoDate, locale: "zh" | "en"): string {
  return locale === "en" ? EN_LONG.format(new Date(toUtcMs(date))) : formatDateZh(date);
}

/** Formats a short date for the locale. Chinese: "1月10日"; English: "Jan 10" */
export function formatShortDate(date: IsoDate, locale: "zh" | "en"): string {
  return locale === "en" ? EN_SHORT.format(new Date(toUtcMs(date))) : formatShortDateZh(date);
}

/** Date range, e.g. "1月10日 – 1月12日" / "Jan 10 – Jan 12" */
export function formatDateRange(start: IsoDate, end: IsoDate, locale: "zh" | "en"): string {
  return `${formatShortDate(start, locale)} – ${formatShortDate(end, locale)}`;
}
