"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localePath } from "@/i18n/config";
import { orderAccess } from "@/lib/booking/order-access";
import { createOrderCheckout, stripeEnabled } from "@/lib/stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages } from "@/messages";

export interface ReviewFormState {
  message?: string;
  fieldErrors?: Partial<Record<"rating" | "name" | "body", string>>;
  values?: { rating?: string; name?: string; body?: string };
  done?: boolean;
}

const schema = z.object({
  locale: z.enum(["zh", "en"]),
  /** Which item is being reviewed: the main order number (item 1) or another cart item's number (like SC-XXXXXXXX-1) */
  lineNo: z.string().regex(/^SC-[A-HJ-NP-Z2-9]{8}(-\d{1,3})?$/),
  rating: z.coerce.number().int().min(1).max(5),
  name: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
});

/**
 * Customers write reviews on the order page; only visitors who may open the order can (see order-access.ts).
 * Only returned orders are accepted; each item in an order can get its own review (helmet-cover add-ons are not reviewed separately).
 * New reviews are pending and appear on that product's page only after the admin publishes them.
 */
export async function submitReview(_previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const locale = raw.locale === "en" ? "en" : "zh";
  const t = getMessages(locale).review;
  const values = { rating: raw.rating, name: raw.name, body: raw.body };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => i.path[0]));
    const fieldErrors: ReviewFormState["fieldErrors"] = {};
    if (fields.has("rating")) fieldErrors.rating = t.errorRating;
    if (fields.has("name")) fieldErrors.name = t.errorName;
    if (fields.has("body")) fieldErrors.body = t.errorBody;
    if (Object.keys(fieldErrors).length === 0) return { message: t.errorGeneric, values };
    return { fieldErrors, values };
  }
  const input = parsed.data;

  const service = createSupabaseServiceClient();
  const { data: booking, error } = await service
    .from("bookings")
    .select("id, style_id, status, parent_booking_id, cart_item")
    .eq("booking_no", input.lineNo)
    .maybeSingle();
  // Only visitors who may open the order (checked on its main order) can review it
  const mainNo = input.lineNo.split("-").slice(0, 2).join("-");
  const { data: main } = await service
    .from("bookings")
    .select("id, user_id, customer_email")
    .eq("booking_no", mainNo)
    .is("parent_booking_id", null)
    .maybeSingle();
  if (!main || (await orderAccess(main)) !== "allowed") return { message: t.errorGeneric, values };
  if (error) {
    console.error("[submitReview] 读取订单失败", error);
    return { message: t.errorGeneric, values };
  }
  // The main order (item 1) or another cart item; helmet-cover add-ons and bundle parts can't be reviewed separately
  const isLine = booking && (!booking.parent_booking_id || booking.cart_item);
  if (!booking || !isLine || booking.status !== "returned") {
    return { message: t.errorNotReturned, values };
  }

  const { error: insertError } = await service.from("reviews").insert({
    booking_id: booking.id,
    style_id: booking.style_id,
    rating: input.rating,
    display_name: input.name,
    body: input.body,
    locale: input.locale,
  });
  if (insertError?.code === "23505") return { message: t.errorExists, values };
  if (insertError) {
    console.error("[submitReview] 写入评价失败", insertError);
    return { message: t.errorGeneric, values };
  }

  revalidatePath(localePath(input.locale, `/booking/${mainNo}`));
  revalidatePath("/admin/reviews");
  return { done: true };
}

const paymentSchema = z.object({
  locale: z.enum(["zh", "en"]),
  bookingNo: z.string().regex(/^SC-[A-HJ-NP-Z2-9]{8}$/),
});

/**
 * "Pay now" on the order page, for an unpaid order (the customer left the payment page, or it timed out while the order is still open):
 * opens a fresh Stripe page. Only for visitors who may open the order (see order-access.ts).
 */
export async function startPayment(formData: FormData) {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !stripeEnabled()) return;
  const { locale, bookingNo } = parsed.data;
  const orderPath = localePath(locale, `/booking/${bookingNo}`);

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const { data: allowed, error: limitError } = await createSupabaseServiceClient().rpc("hit_rate_limit", {
    p_bucket: "payment_ip",
    p_key_hash: createHash("sha256").update(ip).digest("hex"),
    p_limit: 10,
    p_window_seconds: 600,
  });
  if (limitError || !allowed) redirect(`${orderPath}?pay=error`);

  const { data: order } = await createSupabaseServiceClient()
    .from("bookings")
    .select("id, user_id, customer_email, parent_booking_id")
    .eq("booking_no", bookingNo)
    .maybeSingle();
  if (!order || order.parent_booking_id || (await orderAccess(order)) !== "allowed") redirect(orderPath);

  let url: string | null;
  try {
    url = await createOrderCheckout(bookingNo, locale);
  } catch (error) {
    console.error("[startPayment] 创建付款页面失败", error);
    url = null;
  }
  redirect(url ?? `${orderPath}?pay=error`);
}
