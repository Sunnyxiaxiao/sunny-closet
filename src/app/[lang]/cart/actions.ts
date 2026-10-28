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
import { formatShippingAddress, shippingFeeCents } from "@/lib/shipping";
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
 * The customer submits the cart and it becomes one order (one order number).
 *
 * Security rule: nothing from the browser is trusted.
 * Prices, date validity, whether styles are active and the shipping fee are all re-read and recomputed here;
 * availability is decided by create_order in a database transaction, so concurrent orders never share an item, and if any item is unavailable the whole order fails.
 */
export async function submitOrder(_previous: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const raw = Object.fromEntries(formData);
  const values = readValues(raw);
  // The language of the page the form was on; messages and the order page redirect use it
  const locale = isLocale(raw.locale) ? raw.locale : DEFAULT_LOCALE;
  const messages = getMessages(locale);
  const t = messages.cart;
  const defaultError = messages.bookingErrors.default;
  const fail = (message: string, fieldErrors?: Record<string, string>): BookingFormState => ({
    message,
    fieldErrors,
    values,
  });

  // Honeypot: humans can't see this field, bots fill it in
  if (text(raw, "website").trim() !== "") return fail(defaultError);

  const parsed = createCheckoutSchema(messages.validation).safeParse(raw);
  if (!parsed.success) {
    return fail(messages.submitErrors.checkFields, firstFieldErrors(parsed.error));
  }
  const input = parsed.data;
  const linesParsed = cartLinesSchema.safeParse(parseJson(text(raw, "lines")));
  if (!linesParsed.success) return fail(t.invalidCart);
  const shipping = input.fulfillment === "shipping";

  // Re-read prices and shop settings (trust only the database, never the page)
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

  // Rate limits: at most 6 per network per 10 minutes and 3 per email per hour
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

  // Shipping fee from the recomputed prices (free with a 2-day set or $99+ rental and add-ons)
  const shippingCents = shipping
    ? shippingFeeCents(
        lines.map((l) => ({
          category: l.style?.category ?? "",
          rentalDays: l.rentalDays,
          rentalCents: l.rentalCents,
          addOnCents: l.addOns.reduce((sum, a) => sum + a.cents, 0),
        })),
        input.shippingState,
      )
    : 0;

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
    p_shipping_cents: shippingCents,
  });

  const order = data?.[0];
  if (error || !order) {
    if (!bookingErrorCode(error?.message)) console.error("[submitOrder] 创建订单失败", error);
    const message = mapBookingError(error?.message, locale);
    // Database errors say which item failed (e.g. no_availability line=2); no need to mention it for a single item
    const line = /line=(\d+)/.exec(error?.message ?? "")?.[1];
    return fail(line && lines.length > 1 ? t.lineError(Number(line), message) : message);
  }

  // Orders placed while signed in are linked to the account (child orders included) and show up in "My account"
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

  // Email the owner about the new order (after the response is sent, so the customer doesn't wait)
  const origin = await publicOrigin();
  after(() => notifyNewOrder(order.booking_id, origin));

  // The page clears the cart before navigating (a direct redirect wouldn't give it time to clear)
  return { redirectTo: localePath(locale, `/booking/${order.booking_no}`) };
}
