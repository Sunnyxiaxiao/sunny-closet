import type { NextRequest } from "next/server";
import { getAvailability, getSettings, getToday } from "@/lib/catalog";
import { validateRentalRange } from "@/lib/booking/rules";
import { availabilityQuerySchema, rangeErrorMessages } from "@/lib/validation/rental-query";

/** 款式详情页实时查询：GET /api/availability?styleId=...&start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return Response.json({ error: "参数不正确" }, { status: 400 });
  }
  const { styleId, start, end } = parsed.data;

  const [settings, today] = await Promise.all([getSettings(), getToday()]);
  const rangeError = validateRentalRange({ start, end }, { today, maxRentalDays: settings.maxRentalDays });
  if (rangeError) {
    return Response.json({ error: rangeErrorMessages[rangeError], code: rangeError }, { status: 400 });
  }

  const availability = await getAvailability({ start, end, styleId });
  return Response.json(
    { sizes: availability.get(styleId) ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
