import { connection } from "next/server";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { quoteCart } from "@/lib/cart-quote";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { cartLinesSchema } from "@/lib/validation/booking-request";

const bodySchema = z.object({ lines: cartLinesSchema, locale: z.string().optional() });

/**
 * 购物车页面查询：POST /api/cart  { lines: [{ id, styleId, size, start, end, addOnIds }], locale }
 * → 每件的名称、图片、租金、押金、加购价，以及到店自取 / 邮寄是否还有货（见 src/lib/cart-quote.ts）
 * 每个网络每 10 分钟最多 120 次（购物车每次改动查一次，正常使用远远用不到）；频率检查本身出错时照常放行
 */
export async function POST(request: Request) {
  await connection();
  if ((await hitRateLimit("cart_ip", await clientIp(), 120, 600)) === false) {
    return Response.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": "600" } });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_cart" }, { status: 400 });
  }
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE;
  const quote = await quoteCart(parsed.data.lines, locale);
  return Response.json(quote, { headers: { "Cache-Control": "no-store" } });
}
