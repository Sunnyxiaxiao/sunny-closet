"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { shop } from "@/config/shop";
import { DEFAULT_LOCALE, isLocale, localePath } from "@/i18n/config";
import { bookingErrorCode, mapBookingError } from "@/lib/booking/errors";
import type { BookingFormState, BookingFormValues } from "@/lib/booking/form-state";
import { earliestShippingStart, validateRentalRange } from "@/lib/booking/rules";
import { maxRentalDaysFor, SETTINGS_COLUMNS, styleKind, stylePriceTable, toShopSettings } from "@/lib/catalog";
import { formatShortDate, todayIn } from "@/lib/dates";
import { HELMET_COVER_CATEGORY } from "@/lib/helmet-covers";
import { calculateQuote } from "@/lib/pricing";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAuthCookie } from "@/lib/account/customer";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  addOnIdsSchema,
  buildCustomerNote,
  createBookingRequestSchema,
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
    shippingAddress: text(raw, "shippingAddress"),
    note: text(raw, "note"),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * 顾客提交预订。
 *
 * 安全原则：浏览器传来的一切都不可信。
 * 价格、日期是否合法、款式是否在售，全部由这里重新查库、重新计算；
 * 是否有货由数据库的 create_booking 函数在事务里决定，并发也不会重复分配。
 */
export async function submitBooking(
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const raw = Object.fromEntries(formData);
  const values = readValues(raw);
  // 表单所在页面的语言，提示文字和跳转的预订详情页都用这种语言
  const locale = isLocale(raw.locale) ? raw.locale : DEFAULT_LOCALE;
  const messages = getMessages(locale);
  const defaultError = messages.bookingErrors.default;
  const bookingError = (code: string) => mapBookingError(code, locale);
  const fail = (message: string, fieldErrors?: Record<string, string>): BookingFormState => ({
    message,
    fieldErrors,
    values,
  });

  // 蜜罐：真人看不到这个输入框，机器人会填
  if (text(raw, "website").trim() !== "") return fail(defaultError);

  const parsed = createBookingRequestSchema(messages.validation).safeParse(raw);
  if (!parsed.success) {
    return fail(messages.submitErrors.checkFields, firstFieldErrors(parsed.error));
  }
  const input = parsed.data;
  const addOnIdsParsed = addOnIdsSchema.safeParse(formData.getAll("addOn"));
  if (!addOnIdsParsed.success) return fail(bookingError("invalid_addons"));
  const addOnIds = addOnIdsParsed.data;

  // 重新读取价格与店铺设置（只用数据库里的，不信任页面传来的）
  const publicClient = createSupabasePublicClient();
  const [settingsResult, styleResult, addOnResult] = await Promise.all([
    publicClient.from("settings").select(SETTINGS_COLUMNS).single(),
    publicClient
      .from("styles")
      .select("id, category, deposit_cents, rental_prices_cents")
      .eq("id", input.styleId)
      .eq("is_active", true)
      .maybeSingle(),
    publicClient
      .from("styles")
      .select("id, addon_price_cents")
      .in("id", addOnIds.length ? addOnIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("category", HELMET_COVER_CATEGORY)
      .eq("is_active", true),
  ]);
  if (settingsResult.error || styleResult.error || addOnResult.error) {
    console.error(
      "[submitBooking] 读取设置或款式失败",
      settingsResult.error ?? styleResult.error ?? addOnResult.error,
    );
    return fail(defaultError);
  }
  if (!styleResult.data) return fail(bookingError("style_not_found"));
  // 只有雪服能加购头盔套
  if (addOnIds.length > 0 && styleKind(styleResult.data.category) !== "outfit") {
    return fail(bookingError("invalid_addons"));
  }
  const addOnPrices = new Map(addOnResult.data.map((s) => [s.id, s.addon_price_cents]));
  const addOnCents = addOnIds.map((id) => addOnPrices.get(id));
  if (addOnCents.some((cents) => cents === undefined || cents === null)) {
    return fail(bookingError("addon_not_found"));
  }

  const settings = toShopSettings(settingsResult.data);
  const maxRentalDays = maxRentalDaysFor(styleResult.data.category, settings);
  const today = todayIn(shop.timeZone);
  const rangeError = validateRentalRange({ start: input.start, end: input.end }, { today, maxRentalDays });
  if (rangeError) {
    return fail(
      rangeError === "too_long" ? messages.bookingPanel.tooLong(maxRentalDays) : messages.rangeErrors[rangeError],
    );
  }

  const quote = calculateQuote({
    start: input.start,
    end: input.end,
    rentalPricesCents: stylePriceTable(styleResult.data, settings),
    depositCents: styleResult.data.deposit_cents,
    addOnPricesCents: addOnCents as number[],
  });

  const shippingMinDays = settings.shippingMinDays;
  if (input.fulfillment === "shipping" && quote.rentalDays < shippingMinDays) {
    return fail(messages.submitErrors.shippingTooShort(shippingMinDays));
  }
  const shippingEarliest = earliestShippingStart(today, settings.paddings);
  if (input.fulfillment === "shipping" && input.start < shippingEarliest) {
    return fail(
      messages.submitErrors.shippingTooSoon(
        settings.paddings.shipping.leadDays,
        formatShortDate(shippingEarliest, locale),
      ),
    );
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
    console.error("[submitBooking] 频率检查失败", ipCheck.error ?? emailCheck.error);
    return fail(defaultError);
  }
  if (!ipCheck.data || !emailCheck.data) {
    return fail(messages.submitErrors.tooFrequent);
  }

  const { data, error } = await service.rpc("create_booking", {
    p_style_id: input.styleId,
    p_size: input.size,
    p_start: input.start,
    p_end: input.end,
    p_customer_name: input.name,
    p_customer_email: input.email,
    p_customer_phone: input.phone,
    p_fulfillment_method: input.fulfillment,
    p_shipping_address: input.fulfillment === "shipping" ? input.shippingAddress : null,
    p_customer_note: buildCustomerNote(input),
    p_daily_price_cents: quote.averageDailyCents,
    p_rental_cents: quote.rentalCents,
    p_deposit_cents: quote.depositCents,
    p_addon_style_ids: addOnIds,
    p_addon_cents: addOnCents as number[],
  });

  const booking = data?.[0];
  if (error || !booking) {
    if (!bookingErrorCode(error?.message)) console.error("[submitBooking] 创建预订失败", error);
    return fail(mapBookingError(error?.message, locale));
  }

  // 登录状态下下的单记到这个账号名下（含加购的子订单），“我的账号”里能看到
  const user = (await hasAuthCookie())
    ? (await (await createSupabaseServerClient()).auth.getUser()).data.user
    : null;
  if (user) {
    const { error: linkError } = await service
      .from("bookings")
      .update({ user_id: user.id })
      .or(`booking_no.eq.${booking.booking_no},booking_no.like.${booking.booking_no}-%`);
    if (linkError) console.error("[submitBooking] 关联账号失败", linkError);
  }

  // redirect 会抛出异常来跳转，所以必须放在最后
  redirect(localePath(locale, `/booking/${booking.booking_no}`));
}
