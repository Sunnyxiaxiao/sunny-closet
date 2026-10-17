/**
 * 纯日期工具。所有日期都是 "YYYY-MM-DD" 字符串，不带时刻、不带时区。
 * 内部只用 UTC 做加减，永远不使用本地时区，避免夏令时/时区导致差一天。
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

/** 是否为真实存在的日历日期（例如 2026-02-30 返回 false）。 */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  return fromUtcMs(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** to − from 相差的天数（to 在 from 之后为正）。 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 指定时区下“今天”的日期。只在这里接触真实时间。 */
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

/** 例："2026年1月10日（周六）" */
export function formatDateZh(date: IsoDate): string {
  const d = new Date(toUtcMs(date));
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS_ZH[d.getUTCDay()]}）`;
}

/** 例："1月10日" */
export function formatShortDateZh(date: IsoDate): string {
  const d = new Date(toUtcMs(date));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
