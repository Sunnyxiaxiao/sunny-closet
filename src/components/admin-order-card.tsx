import { saveAdminNote, updateBookingStatus } from "@/app/admin/actions";
import { shop } from "@/config/shop";
import { nextStatuses } from "@/lib/booking/status";
import { handoverText } from "@/lib/booking/schedule";
import { formatDateZh, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { BookingRow, BookingStatus } from "@/lib/supabase/database.types";
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
}: {
  booking: BookingRow;
  styleName: string;
  itemCode: string;
  /**
   * 子订单，状态跟着这单走：购物车里的其他件（cartItem，有自己的尺码、日期、租金、押金）、
   * 加购的头盔套、组合套装里的其他单品（bundlePart，0 元）
   */
  addOns?: { name: string; itemCode: string; cents: number; bundlePart?: boolean; cartItem?: BookingRow }[];
}) {
  const actions = nextStatuses(booking.status);
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
            <Line label="运费" value={booking.shipping_cents > 0 ? formatMoney(booking.shipping_cents) : "包邮"} />
          )}
          <Line
            label={`${t.rental} / ${t.deposit} / ${t.total}`}
            value={`${formatMoney(rentalTotal)} / ${formatMoney(depositTotal)} / ${formatMoney(orderTotal)}`}
          />
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

      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((next) => (
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
          ))}
        </div>
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
