import { randomUUID } from "node:crypto";
import {
  acceptShortNotice,
  declineShortNotice,
  markRefunded,
  saveAdminNote,
  updateBookingStatus,
} from "@/app/admin/actions";
import { AdminCancelOrder } from "@/components/admin-cancel-order";
import { AdminOrderPayment } from "@/components/admin-order-payment";
import { AdminOverdue } from "@/components/admin-overdue";
import { shop } from "@/config/shop";
import { nextStatuses } from "@/lib/booking/status";
import { ACCEPT_WINDOW_HOURS } from "@/lib/booking/acceptance";
import { cardLabel } from "@/lib/booking/card-payment";
import { overdueInfo } from "@/lib/booking/overdue";
import { handoverText } from "@/lib/booking/schedule";
import { formatDateZh, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { refundOwedCents } from "@/lib/payments/cancel-order";
import type { BookingRow, BookingStatus, CardChargeRow, ConditionSnapshot } from "@/lib/supabase/database.types";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

const STATUS_BADGE: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  picked_up: "bg-sky-100 text-sky-900",
  returned: "bg-neutral-200 text-neutral-800",
  rejected: "bg-red-100 text-red-900",
  cancelled: "bg-neutral-100 text-neutral-500",
};

/** 会让订单作废的操作用红色描边，其余用深色实心按钮 */
const DESTRUCTIVE: ReadonlySet<BookingStatus> = new Set(["rejected", "cancelled"]);

function formatPlacedAt(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: shop.timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AdminOrderCard({
  booking,
  styleName,
  itemCode,
  addOns = [],
  cardCharges,
  conditions = [],
  overdue,
}: {
  booking: BookingRow;
  styleName: string;
  itemCode: string;
  /** 这单（含子订单）拿到的、有状态说明的那几件：下单时的说明和照片，以及顾客勾选确认的时间 */
  conditions?: { name: string; snapshot: ConditionSnapshot; acknowledgedAt: string | null }[];
  /**
   * 子订单，状态跟着这单走：购物车里的其他件（cartItem，有自己的尺码、日期、租金、押金）、
   * 加购的头盔套、组合套装里的其他单品（bundlePart，0 元）
   */
  addOns?: { name: string; itemCode: string; cents: number; bundlePart?: boolean; cartItem?: BookingRow }[];
  /** 这单之后从卡里扣过的钱；undefined = 没配置 Stripe，不显示刷卡付款 */
  cardCharges?: CardChargeRow[];
  /** 已取件的单：今天、逾期占用天数，以及它占着的件撞上的已有订单 */
  overdue?: { today: IsoDate; holdDays: number; conflicts: { bookingNo: string; startDate: string; itemCode: string }[] };
}) {
  const awaitingAcceptance = booking.acceptance_status === "awaiting" && booking.status === "pending";
  // Awaiting orders are accepted or declined below (a decline owes a refund), not moved with the status buttons
  const actions = awaitingAcceptance ? [] : nextStatuses(booking.status, booking.payment_method);
  const orderTotal = booking.total_cents + addOns.reduce((sum, a) => sum + a.cents, 0);
  const cartItems = addOns.filter((a) => a.cartItem);
  const rentalTotal = booking.rental_cents + addOns.reduce((sum, a) => sum + (a.cartItem?.rental_cents ?? (a.bundlePart ? 0 : a.cents)), 0);
  const depositTotal = booking.deposit_cents + cartItems.reduce((sum, a) => sum + a.cartItem!.deposit_cents, 0);
  const dates = (b: BookingRow) =>
    `${formatDateZh(b.start_date)} – ${formatDateZh(b.end_date)}（${b.rental_days} 天）`;

  return (
    <li className="border border-neutral-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-base font-bold tracking-wider">{booking.booking_no}</span>
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[booking.status]}`}
          >
            {messages.bookingStatus[booking.status]}
          </span>
          {overdue && (overdueInfo(booking, overdue.today, overdue.holdDays)?.lateDays ?? 0) > 0 && (
            <span className="bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">逾期未还</span>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          {t.placedAt} {formatPlacedAt(booking.created_at)}
        </p>
      </div>

      <div className="mt-4 grid gap-5 text-sm sm:grid-cols-2">
        <dl className="space-y-1.5">
          <Line
            label={cartItems.length > 0 ? "第 1 件" : messages.bookingPage.item}
            value={`${styleName} · ${booking.size}${cartItems.length > 0 ? ` · ${formatMoney(booking.rental_cents)}` : ""}`}
          />
          <Line label={t.inventoryCode} value={itemCode} mono />
          {addOns.map((addOn, index) =>
            addOn.cartItem ? (
              <Line
                key={index}
                label={`第 ${cartItems.indexOf(addOn) + 2} 件`}
                value={`${addOn.name} · ${addOn.cartItem.size} · ${formatMoney(addOn.cartItem.rental_cents)}\n${addOn.itemCode}${
                  addOn.cartItem.start_date !== booking.start_date || addOn.cartItem.end_date !== booking.end_date
                    ? ` · ${dates(addOn.cartItem)}`
                    : ""
                }`}
              />
            ) : addOn.bundlePart ? (
              <Line key={index} label={t.bundlePart} value={`${addOn.name} · ${addOn.itemCode}`} />
            ) : (
              <Line
                key={index}
                label={messages.helmet.addOnLine}
                value={`${addOn.name} · ${addOn.itemCode} · ${formatMoney(addOn.cents)}`}
              />
            ),
          )}
          <Line
            label={messages.bookingPage.dates}
            value={dates(booking)}
          />
          <Line label={messages.bookingPage.fulfillment} value={messages.fulfillment[booking.fulfillment_method]} />
          <Line
            label={messages.bookingPage.handover}
            value={handoverText(
              { start: booking.start_date as IsoDate, end: booking.end_date as IsoDate },
              booking.fulfillment_method,
              { leadDays: booking.lead_days, tailDays: booking.tail_days },
            )}
          />
          {booking.fulfillment_method === "shipping" && (
            <Line
              label="运费"
              value={
                booking.rush_fee_cents > 0
                  ? `${formatMoney(booking.shipping_cents)}（含加急 ${formatMoney(booking.rush_fee_cents)}，用 Priority Mail 寄）`
                  : booking.shipping_cents > 0
                    ? formatMoney(booking.shipping_cents)
                    : "包邮"
              }
            />
          )}
          {depositTotal > 0 ? (
            <Line
              label={`${t.rental} / ${t.deposit} / ${t.total}`}
              value={`${formatMoney(rentalTotal)} / ${formatMoney(depositTotal)} / ${formatMoney(orderTotal)}`}
            />
          ) : (
            <Line label={`${t.rental} / ${t.total}`} value={`${formatMoney(rentalTotal)} / ${formatMoney(orderTotal)}`} />
          )}
        </dl>

        <dl className="space-y-1.5">
          <Line label={t.customer} value={booking.customer_name} />
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-neutral-500">{t.phone}</dt>
            <dd>
              <a href={`tel:${booking.customer_phone}`} className="underline underline-offset-2">
                {booking.customer_phone}
              </a>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-neutral-500">{t.email2}</dt>
            <dd className="break-all">
              <a href={`mailto:${booking.customer_email}`} className="underline underline-offset-2">
                {booking.customer_email}
              </a>
            </dd>
          </div>
          {booking.shipping_address && <Line label={t.address} value={booking.shipping_address} />}
          {booking.customer_note && <Line label={t.note} value={booking.customer_note} />}
        </dl>
      </div>

      {awaitingAcceptance && (
        <div className="mt-4 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">急单待你确认：离第一个滑雪日不到一周，顾客选了“不加急，等店主确认”</p>
          <p className="mt-1">
            {booking.paid_at
              ? `顾客已付款 ${formatMoney(booking.paid_cents ?? 0)}。能按时寄到就接单；接不了就拒单，订单取消并标为待退款，系统会发邮件告诉顾客全额退款。付款后 ${ACCEPT_WINDOW_HOURS} 小时（${formatPlacedAt(new Date(new Date(booking.paid_at).getTime() + ACCEPT_WINDOW_HOURS * 3_600_000).toISOString())}）还没处理会自动拒单。`
              : "顾客还没付款，付款后才能接单。现在拒单会直接取消这单。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {booking.paid_at && (
              <form action={acceptShortNotice}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <button type="submit" className="h-10 rounded-full bg-neutral-900 px-5 text-sm font-bold text-white hover:bg-neutral-700">
                  接单（能按时寄到）
                </button>
              </form>
            )}
            <form action={declineShortNotice}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className="h-10 rounded-full border border-red-300 px-5 text-sm font-bold text-red-700 hover:bg-red-50">
                拒单{booking.paid_at ? "并全额退款" : ""}
              </button>
            </form>
          </div>
        </div>
      )}
      {booking.acceptance_status === "accepted" && <p className="mt-4 text-xs text-neutral-500">急单（不加急）：已接单</p>}
      {booking.acceptance_status === "declined" && <p className="mt-4 text-xs text-neutral-500">急单（不加急）：已拒单</p>}

      {overdue && booking.status === "picked_up" && (
        <AdminOverdue
          bookingId={booking.id}
          info={overdueInfo(booking, overdue.today, overdue.holdDays)}
          expectedReturn={booking.expected_return_date}
          holdDays={overdue.holdDays}
          conflicts={overdue.conflicts}
          today={overdue.today}
        />
      )}

      {booking.refund_status && booking.refund_cents !== null && (
        <div
          className={`mt-4 flex flex-wrap items-center gap-3 p-3 text-sm ${booking.refund_status === "due" ? "bg-red-50 text-red-900" : "bg-neutral-50 text-neutral-700"}`}
        >
          {booking.refund_status === "due" ? (
            <>
              <p>
                <span className="font-semibold">待退款 {formatMoney(booking.refund_cents)}</span>
                ：{booking.acceptance_status === "declined" ? "急单已拒单" : "订单已取消，或顾客重复付了款"}
                。
                {booking.stripe_payment_intent_id
                  ? "请到 Stripe 后台的 Transactions 里退款，全额退完会自动标记；只退一部分的话，退完点右边的按钮。"
                  : "这笔钱是当面收的，请当面或转账退回，退完点右边的按钮。"}
              </p>
              <form action={markRefunded}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <button type="submit" className="h-9 rounded-full bg-red-700 px-4 text-xs font-bold text-white hover:bg-red-800">
                  已退款
                </button>
              </form>
            </>
          ) : (
            <p>
              已退款 {formatMoney(booking.refund_cents)}
              {booking.refunded_at && `（${formatPlacedAt(booking.refunded_at)}）`}
            </p>
          )}
        </div>
      )}

      {conditions.length > 0 && (
        <div className="mt-4 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">状态说明（顾客下单前已勾选确认）</p>
          <ul className="mt-2 space-y-2">
            {conditions.map(({ name, snapshot, acknowledgedAt }) => (
              <li key={snapshot.code}>
                <p>
                  <span className="font-medium">{name}</span>{" "}
                  <span className="font-mono text-xs">{snapshot.code}</span> · {snapshot.size}
                  {acknowledgedAt && <span className="text-xs text-neutral-500"> · 确认于 {formatPlacedAt(acknowledgedAt)}</span>}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-neutral-700">{snapshot.note}</p>
                {snapshot.imageUrls.length > 0 && (
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                    {snapshot.imageUrls.map((url, i) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        照片 {i + 1}
                      </a>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((next) =>
            next === "cancelled" ? (
              <AdminCancelOrder
                key={next}
                bookingId={booking.id}
                label={t.actions.cancelled}
                owedCents={refundOwedCents({ paidCents: booking.paid_cents, refundStatus: booking.refund_status })}
                canRefundOnline={cardCharges !== undefined && Boolean(booking.stripe_payment_intent_id)}
              />
            ) : (
              <form key={next} action={updateBookingStatus}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="nextStatus" value={next} />
                <button
                  type="submit"
                  className={[
                    "h-10 rounded-full px-5 text-sm font-bold",
                    DESTRUCTIVE.has(next)
                      ? "border border-red-300 text-red-700 hover:bg-red-50"
                      : "bg-neutral-900 text-white hover:bg-neutral-700",
                  ].join(" ")}
                >
                  {t.actions[next]}
                </button>
              </form>
            ),
          )}
        </div>
      )}

      {cardCharges && (
        <AdminOrderPayment
          bookingId={booking.id}
          paymentMethod={booking.payment_method}
          orderTotalCents={orderTotal}
          cashDepositCents={booking.cash_deposit_cents}
          paidCents={booking.paid_cents}
          cardLabel={booking.card_brand && booking.card_last4 ? cardLabel(booking.card_brand, booking.card_last4) : null}
          charges={cardCharges}
          initialNonce={randomUUID()}
        />
      )}

      <form action={saveAdminNote} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start">
        <input type="hidden" name="bookingId" value={booking.id} />
        <label className="sr-only" htmlFor={`note-${booking.id}`}>
          {t.adminNote}
        </label>
        <textarea
          id={`note-${booking.id}`}
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={booking.admin_note}
          placeholder={t.adminNotePlaceholder}
          className="w-full flex-1 border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full border border-neutral-900 px-5 text-sm font-bold hover:bg-neutral-100"
        >
          {t.saveNote}
        </button>
      </form>
    </li>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-neutral-500">{label}</dt>
      <dd className={`whitespace-pre-line break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
