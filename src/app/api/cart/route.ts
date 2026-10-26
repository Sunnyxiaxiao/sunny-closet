import { connection } from "next/server";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { quoteCart } from "@/lib/cart-quote";
import { cartLinesSchema } from "@/lib/validation/booking-request";

const bodySchema = z.object({ lines: cartLinesSchema, locale: z.string().optional() });

/**
 * 购物车页面查询：POST /api/cart  { lines: [{ id, styleId, size, start, end, addOnIds }], locale }
 * → 每件的名称、图片、租金、押金、加购价，以及到店自取 / 邮寄是否还有货（见 src/lib/cart-quote.ts）
 */
export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_cart" }, { status: 400 });
  }
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE;
  const quote = await quoteCart(parsed.data.lines, locale);
  return Response.json(quote, { headers: { "Cache-Control": "no-store" } });
}
