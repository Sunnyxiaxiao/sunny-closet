"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { DEFAULT_LOCALE, isLocale, localePath } from "@/i18n/config";
import { hasAuthCookie } from "@/lib/account/customer";
import { bookingErrorCode, mapBookingError } from "@/lib/booking/errors";
import type { BookingFormState, BookingFormValues } from "@/lib/booking/form-state";
import { earliestShippingStart } from "@/lib/booking/rules";
import { priceCart } from "@/lib/cart-quote";
import { formatShortDate } from "@/lib/dates";
import { notifyNewOrder } from "@/lib/email/order-notifications";
import { formatShippingAddress } from "@/lib/shipping";
import { publicOrigin } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  buildCustomerNote,
  cartLinesSchema,
  createCheckoutSchema,
  firstFieldErrors,
} from "@/lib/validation/booking-request";
import { getMessages } from "@/messages";

function text(raw: Record<string, FormDataEntryValue>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function readValues(raw: Record<string, FormDataEntryValue>): BookingFormValues {
  return {
    name: text(raw, "name"),
    phone: text(raw, "phone"),
    email: text(raw, "email"),
    wechat: text(raw, "wechat"),
    fulfillment: text(raw, "fulfillment") || "pickup",
    shippingStreet: text(raw, "shippingStreet"),
    shippingCity: text(raw, "shippingCity"),
    shippingState: text(raw, "shippingState"),
    shippingZip: text(raw, "shippingZip"),
    note: text(raw, "note"),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * 顾客提交购物车，生成一笔订单（一个预订编号）。
 *
 * 安全原则：浏览器传来的一切都不可信。
 * 价格、日期是否合法、款式是否在售，全部由这里重新查库、重新计算（邮寄全美包邮，没有运费）；
 * 是否有货由数据库的 create_order 在事务里决定，并发也不会重复分配，任何一件没货整单不成立。
 */
export async function submitOrder(_previous: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const raw = Object.fromEntries(formData);
  const values = readValues(raw);
  // 表单所在页面的语言，提示文字和跳转的预订详情页都用这种语言
  const locale = isLocale(raw.locale) ? raw.locale : DEFAULT_LOCALE;
  const messages = getMessages(locale);
  const t = messages.cart;
  const defaultError = messages.bookingErrors.default;
  const fail = (message: string, fieldErrors?: Record<string, string>): BookingFormState => ({
    message,
    fieldErrors,
    values,
  });

  // 蜜罐：真人看不到这个输入框，机器人会填
  if (text(raw, "website").trim() !== "") return fail(defaultError);

  const parsed = createCheckoutSchema(messages.validation).safeParse(raw);
  if (!parsed.success) {
    return fail(messages.submitErrors.checkFields, firstFieldErrors(parsed.error));
  }
  const input = parsed.data;
  const linesParsed = cartLinesSchema.safeParse(parseJson(text(raw, "lines")));
  if (!linesParsed.success) return fail(t.invalidCart);
  const shipping = input.fulfillment === "shipping";

  // 重新读取价格与店铺设置（只用数据库里的，不信任页面传来的）
  let cart: Awaited<ReturnType<typeof priceCart>>;
  try {
    cart = await priceCart(linesParsed.data, locale);
  } catch (error) {
    console.error("[submitOrder] 读取价格失败", error);
    return fail(defaultError);
  }
  const { settings, today, lines } = cart;

  for (const [index, line] of lines.entries()) {
    if (line.problem) return fail(t.lineError(index + 1, t.problems[line.problem]));
    if (shipping && line.rentalDays < settings.shippingMinDays) {
      return fail(t.lineError(index + 1, messages.submitErrors.shippingTooShort(settings.shippingMinDays)));
    }
  }
  if (shipping) {
    const earliest = earliestShippingStart(today, settings.paddings);
    if (lines.some((l) => l.input.start < earliest)) {
      return fail(
        messages.submitErrors.shippingTooSoon(settings.paddings.shipping.leadDays, formatShortDate(earliest, locale)),
      );
    }
    const [first] = lines;
    if (lines.some((l) => l.input.start !== first.input.start || l.input.end !== first.input.end)) {
      return fail(t.shippingDatesDiffer);
    }
  }

  // 防刷：同一网络 10 分钟最多 6 次；同一邮箱 1 小时最多 3 次
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown";

  const service = createSupabaseServiceClient();
  const [ipCheck, emailCheck] = await Promise.all([
    service.rpc("hit_rate_limit", {
      p_bucket: "booking_ip",
      p_key_hash: sha256(ip),
      p_limit: 6,
      p_window_seconds: 600,
    }),
    service.rpc("hit_rate_limit", {
      p_bucket: "booking_email",
      p_key_hash: sha256(input.email),
      p_limit: 3,
      p_window_seconds: 3600,
    }),
  ]);
  if (ipCheck.error || emailCheck.error) {
    console.error("[submitOrder] 频率检查失败", ipCheck.error ?? emailCheck.error);
    return fail(defaultError);
  }
  if (!ipCheck.data || !emailCheck.data) {
    return fail(messages.submitErrors.tooFrequent);
  }

  const { data, error } = await service.rpc("create_order", {
    p_lines: lines.map((l) => ({
      style_id: l.input.styleId,
      size: l.input.size,
      start: l.input.start,
      end: l.input.end,
      daily_price_cents: l.averageDailyCents,
      rental_cents: l.rentalCents,
      deposit_cents: l.depositCents,
      addon_style_ids: l.addOns.map((a) => a.id),
      addon_cents: l.addOns.map((a) => a.cents),
    })),
    p_customer_name: input.name,
    p_customer_email: input.email,
    p_customer_phone: input.phone,
    p_fulfillment_method: input.fulfillment,
    p_shipping_address: shipping
      ? formatShippingAddress({
          street: input.shippingStreet,
          city: input.shippingCity,
          state: input.shippingState,
          zip: input.shippingZip,
        })
      : null,
    p_customer_note: buildCustomerNote(input),
  });

  const order = data?.[0];
  if (error || !order) {
    if (!bookingErrorCode(error?.message)) console.error("[submitOrder] 创建订单失败", error);
    const message = mapBookingError(error?.message, locale);
    // 数据库报错带着是第几件（例如 no_availability line=2），只有一件时不用说
    const line = /line=(\d+)/.exec(error?.message ?? "")?.[1];
    return fail(line && lines.length > 1 ? t.lineError(Number(line), message) : message);
  }

  // 登录状态下下的单记到这个账号名下（含子订单），“我的账号”里能看到
  const user = (await hasAuthCookie())
    ? (await (await createSupabaseServerClient()).auth.getUser()).data.user
    : null;
  if (user) {
    const { error: linkError } = await service
      .from("bookings")
      .update({ user_id: user.id })
      .or(`booking_no.eq.${order.booking_no},booking_no.like.${order.booking_no}-%`);
    if (linkError) console.error("[submitOrder] 关联账号失败", linkError);
  }

  // 发邮件通知店主有新订单（响应发出去之后再发，不让顾客等）
  const origin = await publicOrigin();
  after(() => notifyNewOrder(order.booking_id, origin));

  // 页面先清空购物车再跳转（直接 redirect 的话页面来不及清空）
  return { redirectTo: localePath(locale, `/booking/${order.booking_no}`) };
}
