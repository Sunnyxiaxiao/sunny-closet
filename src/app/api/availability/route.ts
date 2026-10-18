import type { NextRequest } from "next/server";
import { availableCounts, getAvailability, getSettings, getToday } from "@/lib/catalog";
import { validateRentalRange } from "@/lib/booking/rules";
import { availabilityQuerySchema } from "@/lib/validation/rental-query";

/**
 * 款式详情页实时查询：GET /api/availability?styleId=...&start=YYYY-MM-DD&end=YYYY-MM-DD（滑雪日）
 * → { sizes: [{ size, total, available, shippingAvailable }] }
 *   available 按到店自取算；邮寄要提前寄出、晚些回来，占用更久，单独给出 shippingAvailable
 * 不带 styleId → { counts, shippingCounts }：{ 款式 id: 可租件数 }（雪服页的头盔套加购用）
 */
export async function GET(request: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  const { styleId, start, end } = parsed.data;

  const [settings, today] = await Promise.all([getSettings(), getToday()]);
  // 这里不分品类，取较长的上限；每个品类各自的上限在下单时（create_booking）检查
  const maxRentalDays = Math.max(settings.maxRentalDays, settings.glovesMaxRentalDays);
  const rangeError = validateRentalRange({ start, end }, { today, maxRentalDays });
  if (rangeError) {
    return Response.json({ error: rangeError, code: rangeError }, { status: 400 });
  }

  const [pickup, shipping] = await Promise.all([
    getAvailability({ start, end, styleId }),
    getAvailability({ start, end, styleId, fulfillment: "shipping" }),
  ]);
  const headers = { "Cache-Control": "no-store" };

  if (styleId) {
    const shippingSizes = shipping.get(styleId) ?? [];
    const sizes = (pickup.get(styleId) ?? []).map((s) => ({
      ...s,
      shippingAvailable: shippingSizes.find((x) => x.size === s.size)?.available ?? 0,
    }));
    return Response.json({ sizes }, { headers });
  }
  return Response.json(
    {
      counts: Object.fromEntries(availableCounts(pickup)),
      shippingCounts: Object.fromEntries(availableCounts(shipping)),
    },
    { headers },
  );
}
