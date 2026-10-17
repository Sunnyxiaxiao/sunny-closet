import { z } from "zod";
import { validateRentalRange, type RangeError } from "@/lib/booking/rules";
import { isIsoDate, type IsoDate } from "@/lib/dates";

const optionalText = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined);

/** 款式列表 / 详情页 URL 上的筛选参数：?start=2026-01-10&end=2026-01-12&size=M */
export const rentalSearchParamsSchema = z.object({
  start: optionalText,
  end: optionalText,
  size: optionalText,
});

export type RentalSearch =
  | { kind: "none"; size?: string }
  | { kind: "valid"; start: IsoDate; end: IsoDate; size?: string }
  | { kind: "invalid"; error: RangeError; start?: string; end?: string; size?: string };

export function parseRentalSearch(
  raw: Record<string, string | string[] | undefined>,
  options: { today: IsoDate; maxRentalDays: number },
): RentalSearch {
  const { start, end, size } = rentalSearchParamsSchema.parse(raw);
  if (!start && !end) return { kind: "none", size };
  const error = validateRentalRange({ start, end }, options);
  if (error) return { kind: "invalid", error, start, end, size };
  return { kind: "valid", start: start as IsoDate, end: end as IsoDate, size };
}

/** /api/availability 的查询参数 */
export const availabilityQuerySchema = z.object({
  styleId: z.uuid(),
  start: z.string().refine(isIsoDate, "日期格式应为 YYYY-MM-DD"),
  end: z.string().refine(isIsoDate, "日期格式应为 YYYY-MM-DD"),
});

export const rangeErrorMessages: Record<RangeError, string> = {
  invalid_date: "请选择取件日期和归还日期",
  end_before_start: "归还日期不能早于取件日期",
  start_in_past: "取件日期不能早于今天",
  too_long: "租期超过了最长天数",
};
