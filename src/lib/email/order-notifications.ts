import "server-only";
import type { IsoDate } from "@/lib/dates";
import { adminNotifyEmail, sendEmail } from "@/lib/email/send";
import { newOrderEmail, orderConfirmedEmail, type OrderEmailData } from "@/lib/email/templates";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** 读取一笔订单（主订单 + 购物车里的其他件 + 加购的头盔套）用来写邮件；组合套装里的 0 元单品不列出 */
async function loadOrder(bookingId: string): Promise<OrderEmailData | null> {
  const service = createSupabaseServiceClient();
  const columns =
    "id, booking_no, style_id, size, start_date, end_date, rental_days, rental_cents, deposit_cents, total_cents, lead_days, tail_days, fulfillment_method, shipping_address, customer_name, customer_email, customer_phone, customer_note, cart_item, bundle_part, parent_booking_id";
  const [{ data: main, error }, { data: children, error: childError }] = await Promise.all([
    service.from("bookings").select(columns).eq("id", bookingId).maybeSingle(),
    service.from("bookings").select(columns).eq("parent_booking_id", bookingId).eq("bundle_part", false).order("booking_no"),
  ]);
  if (error || childError) throw new Error(`读取订单失败：${(error ?? childError)!.message}`);
  if (!main || main.parent_booking_id) return null;

  const all = [main, ...(children ?? [])];
  const { data: styles } = await service
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [...new Set(all.map((b) => b.style_id))]);
  const names = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    const join = (name: string | undefined) => [s?.brand, name].filter(Boolean).join(" ") || "—";
    return { name: join(s?.name), nameEn: join(s?.name_en || s?.name) };
  };

  const lines = [main, ...(children ?? []).filter((c) => c.cart_item)];
  return {
    bookingNo: main.booking_no,
    customerName: main.customer_name,
    customerEmail: main.customer_email,
    customerPhone: main.customer_phone,
    customerNote: main.customer_note,
    fulfillment: main.fulfillment_method,
    shippingAddress: main.shipping_address,
    lines: lines.map((l) => ({
      ...names(l.style_id),
      size: l.size,
      start: l.start_date as IsoDate,
      end: l.end_date as IsoDate,
      rentalDays: l.rental_days,
      rentalCents: l.rental_cents,
      depositCents: l.deposit_cents,
      leadDays: l.lead_days,
      tailDays: l.tail_days,
    })),
    addOns: (children ?? []).filter((c) => !c.cart_item).map((a) => ({ ...names(a.style_id), cents: a.rental_cents })),
    totalCents: all.reduce((sum, b) => sum + b.total_cents, 0),
  };
}

/** 有人下单：通知店主（在 after() 里调用，不拖慢下单） */
export async function notifyNewOrder(bookingId: string, origin: string) {
  try {
    const order = await loadOrder(bookingId);
    if (order) await sendEmail(newOrderEmail(order, { to: adminNotifyEmail(), origin }));
  } catch (error) {
    console.error("[notifyNewOrder] 发送新订单通知失败", error);
  }
}

/** 店主确认订单：告诉顾客付款方式 */
export async function notifyOrderConfirmed(bookingId: string, origin: string) {
  try {
    const order = await loadOrder(bookingId);
    if (order) await sendEmail(orderConfirmedEmail(order, { origin }));
  } catch (error) {
    console.error("[notifyOrderConfirmed] 发送确认邮件失败", error);
  }
}
