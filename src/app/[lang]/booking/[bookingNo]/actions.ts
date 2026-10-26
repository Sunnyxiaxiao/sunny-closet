"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localePath } from "@/i18n/config";
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
  /** 评价哪一件：主订单编号（第 1 件），或购物车里其他件的编号（SC-XXXXXXXX-1 这种） */
  lineNo: z.string().regex(/^SC-[A-HJ-NP-Z2-9]{8}(-\d{1,3})?$/),
  rating: z.coerce.number().int().min(1).max(5),
  name: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
});

/**
 * 顾客在订单页写评价。订单编号就是凭证（详情页也是靠编号打开的）。
 * 只接受已归还（returned）的订单；一笔订单里买了几件，每件可以各写一条（加购的头盔套不单独评价）。
 * 写入后是待审核状态，管理员发布后才出现在那件商品的页面上。
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
  if (error) {
    console.error("[submitReview] 读取订单失败", error);
    return { message: t.errorGeneric, values };
  }
  // 主订单（第 1 件）或购物车里的其他件；加购的头盔套、套装里的单品不能单独评价
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

  const orderNo = input.lineNo.split("-").slice(0, 2).join("-");
  revalidatePath(localePath(input.locale, `/booking/${orderNo}`));
  revalidatePath("/admin/reviews");
  return { done: true };
}
