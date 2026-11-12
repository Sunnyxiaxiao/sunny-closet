import type { Metadata } from "next";
import Link from "@/components/storefront-link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { ReviewForm } from "@/components/review-form";
import { shop } from "@/config/shop";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { cardLabel } from "@/lib/booking/card-payment";
import { ACCEPT_WINDOW_HOURS } from "@/lib/booking/acceptance";
import { orderAccess, type OrderAccess } from "@/lib/booking/order-access";
import { handoverText } from "@/lib/booking/schedule";
import { formatDate, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PAYMENT_WINDOW_MINUTES, settleOrderOnView, stripeEnabled } from "@/lib/stripe";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages, sizeLabel } from "@/messages";
import { startPayment } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getMessages(await getLocale()).bookingPage.metaTitle,
    robots: { index: false, follow: false },
  };
}

/** Order number: SC- plus 8 characters (without the easily confused 0/O/1/I); reject obviously invalid URLs here first */
const BOOKING_NO_RE = /^SC-[A-HJ-NP-Z2-9]{8}$/;

export default async function BookingPage({ params, searchParams }: PageProps<"/[lang]/booking/[bookingNo]">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Suspense fallback={<BookingSkeleton />}>
        <BookingDetail params={params} searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

async function BookingDetail({
  params,
  searchParams,
  locale,
}: Pick<PageProps<"/[lang]/booking/[bookingNo]">, "params" | "searchParams"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.bookingPage;
  const { bookingNo } = await params;
  // Set by the payment flow: ?paid=1 after paying on Stripe, ?pay=error when the payment page couldn't open
  const query = await searchParams;
  if (!BOOKING_NO_RE.test(bookingNo)) notFound();
  await connection();

  // The bookings table isn't open to anonymous visitors, so look it up by number with the service key.
  // Display fields only; the account and email are read just to check who may see the order, never shown.
  const service = createSupabaseServiceClient();
  const { data: booking, error } = await service
    .from("bookings")
    .select(
      "id, booking_no, style_id, status, size, start_date, end_date, rental_days, rental_cents, deposit_cents, shipping_cents, total_cents, fulfillment_method, parent_booking_id, lead_days, tail_days, user_id, customer_email",
    )
    .eq("booking_no", bookingNo)
    .maybeSingle();
  if (error) throw new Error(`读取预订失败：${error.message}`);
  // Add-on child orders have no page of their own; customers only use the main order number
  if (!booking || booking.parent_booking_id) notFound();
  // Only the browser that placed the order, the customer's account or the admin (see order-access.ts)
  const access = await orderAccess(booking);
  if (access !== "allowed") return <OrderLocked access={access} bookingNo={booking.booking_no} locale={locale} />;

  const { data: children, error: childError } = await service
    .from("bookings")
    .select("id, booking_no, style_id, size, start_date, end_date, rental_days, rental_cents, deposit_cents, total_cents, lead_days, tail_days, cart_item")
    .eq("parent_booking_id", booking.id)
    // Other separates in a bundle are $0 child orders; the customer only sees the whole set
    .eq("bundle_part", false)
    .order("booking_no");
  if (childError) throw new Error(`读取订单明细失败：${childError.message}`);
  // Cart orders: item 1 is the main order, every other item is a cart_item child order; remaining child orders are helmet-cover add-ons
  const lines = [booking, ...children.filter((c) => c.cart_item)];
  const addOns = children.filter((c) => !c.cart_item);

  const { data: styles } = await createSupabasePublicClient()
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [booking.style_id, ...children.map((a) => a.style_id)]);
  const styleName = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    const name = locale === "en" && s?.name_en ? s.name_en : s?.name;
    return [s?.brand, name].filter(Boolean).join(" ") || "—";
  };
  const totalCents = booking.total_cents + children.reduce((sum, a) => sum + a.total_cents, 0);
  const depositCents = lines.reduce((sum, l) => sum + l.deposit_cents, 0);
  const multi = lines.length > 1;
  // When every item has the same dates, show pickup / return only once
  const sameDates = lines.every((l) => l.start_date === booking.start_date && l.end_date === booking.end_date);
  const handover = (l: (typeof lines)[number]) =>
    handoverText(
      { start: l.start_date as IsoDate, end: l.end_date as IsoDate },
      booking.fulfillment_method,
      { leadDays: l.lead_days, tailDays: l.tail_days },
      locale,
    );

  // Card payments (only when Stripe is configured; see src/lib/stripe.ts). An unpaid order whose payment attempt is over is settled here
  // too (confirmed if paid, cancelled if its page expired or never opened), in case the webhook and the sweep haven't yet (e.g. locally)
  const online = stripeEnabled();
  const pay = online
    ? (
        await service
          .from("bookings")
          .select(
            "payment_method, cash_deposit_cents, paid_cents, card_brand, card_last4, stripe_checkout_session_id, rush_fee_cents, acceptance_status",
          )
          .eq("id", booking.id)
          .single()
      ).data
    : null;
  const method = pay?.payment_method ?? null;
  let status = booking.status;
  // Waiting on Stripe (paying, or saving a card instead of a deposit). A paid short-notice order waiting for the owner isn't
  const waitsOnStripe = (s: string) => online && s === "pending" && method !== "in_person" && pay?.paid_cents == null;
  if (waitsOnStripe(status)) {
    const expired = await settleOrderOnView(booking.id).catch((error) => {
      console.error("[booking] 检查付款是否超时失败", error);
      return false;
    });
    if (expired) status = "cancelled";
  }
  const waiting = waitsOnStripe(status) ? (method === "in_person_card" ? "card" : "payment") : null;
  const inPerson = method === "in_person" || method === "in_person_card";
  const paidCents = pay?.paid_cents ?? null;
  const card = pay?.card_brand && pay.card_last4 ? cardLabel(pay.card_brand, pay.card_last4) : null;
  const cashDeposit = formatMoney(pay?.cash_deposit_cents ?? 0);
  const acceptance = pay?.acceptance_status ?? null;
  const [title, body] =
    status === "pending" && acceptance === "awaiting" && paidCents !== null
      ? [t.awaitingOwnerTitle, t.awaitingOwnerBody(ACCEPT_WINDOW_HOURS)]
      : status === "cancelled" && acceptance === "declined"
        ? [t.declinedTitle, t.declinedBody]
        : waiting === "payment"
      ? [t.awaitingPaymentTitle, t.awaitingPaymentBody(PAYMENT_WINDOW_MINUTES)]
      : waiting === "card"
        ? [t.awaitingCardTitle, t.awaitingCardBody(PAYMENT_WINDOW_MINUTES)]
        : status === "confirmed" && method === "card" && paidCents !== null
          ? [t.paidTitle, t.paidBody]
          : status === "confirmed" && inPerson
            ? [t.inPersonTitle, t.inPersonBody]
            : [t.titleByStatus[status], t.bodyByStatus[status]];
  // Returned orders can be reviewed, one review per item; show the customer's own review once written
  const reviews =
    status === "returned"
      ? ((
          await service
            .from("reviews")
            .select("booking_id, rating, body, display_name")
            .in("booking_id", lines.map((l) => l.id))
        ).data ?? [])
      : [];
  const tr = messages.review;

  return (
    <article>
      <p className="text-xs uppercase tracking-widest text-neutral-500">{t.number}</p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{booking.booking_no}</p>

      <h1 className="mt-8 text-2xl font-black leading-snug">{title}</h1>
      <p className="mt-2 text-neutral-700">{body}</p>
      <p className="mt-2 text-sm text-neutral-500">{t.saveHint}</p>

      {query.paid && card && (
        <p className="mt-8 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{method === "in_person_card" ? t.cardSavedNotice : t.paidNotice}</p>
      )}
      {query.pay === "error" && <p className="mt-8 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t.payError}</p>}

      {waiting && (
        <section className="mt-8 border border-neutral-900 p-5">
          <p className="text-sm">
            {waiting === "payment" ? t.paymentAmount : t.inPersonDue}{" "}
            <span className="text-lg font-bold">{formatMoney(totalCents)}</span>
          </p>
          <form action={startPayment} className="mt-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="bookingNo" value={booking.booking_no} />
            <button type="submit" className="h-11 rounded-full bg-neutral-900 px-8 text-sm font-bold text-white hover:bg-neutral-700">
              {waiting === "payment" ? t.payButton : t.saveCardButton}
            </button>
          </form>
          <p className="mt-3 text-xs text-neutral-500">{t.paymentSecure}</p>
          <p className="mt-1 text-xs text-neutral-500">{t.noDepositNote}</p>
        </section>
      )}

      {inPerson && paidCents === null && (status === "confirmed" || status === "picked_up") && (
        <section className="mt-8 border border-neutral-900 p-5 text-sm">
          <p>
            {t.inPersonDue} <span className="text-lg font-bold">{formatMoney(totalCents)}</span>
          </p>
          <p className="mt-1 text-neutral-600">{t.inPersonMethods}</p>
          {method === "in_person" && <p className="mt-2 text-neutral-600">{t.inPersonDepositLine(cashDeposit)}</p>}
          {method === "in_person_card" && card && <p className="mt-2 text-xs text-neutral-500">{t.cardOnFileLine(card)}</p>}
        </section>
      )}

      {paidCents !== null && (
        <section className="mt-8 border border-neutral-200 p-5 text-sm">
          <p>
            {method === "card" ? t.paidRow : t.inPersonPaid} <span className="font-bold">{formatMoney(paidCents)}</span>
            {method === "card" && card && <span className="text-neutral-600"> · {card}</span>}
          </p>
          {method === "card" && <p className="mt-2 text-xs text-neutral-500">{t.noDepositNote}</p>}
          {method === "in_person_card" && card && <p className="mt-2 text-xs text-neutral-500">{t.cardOnFileLine(card)}</p>}
        </section>
      )}

      {!online && status === "confirmed" && (
        <section className="mt-8 border border-neutral-900 p-5">
          <h2 className="text-base font-bold">{t.paymentTitle}</h2>
          <p className="mt-2 text-sm">
            {t.paymentAmount}{" "}
            <span className="text-lg font-bold">{formatMoney(totalCents)}</span>
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-neutral-500">{t.zelle}</dt>
              <dd className="font-semibold">{shop.payment.zelle}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-neutral-500">{t.venmo}</dt>
              <dd className="font-semibold">{shop.payment.venmo}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutral-600">
            {t.paymentNote} {t.bookingNoLabel}
            <span className="font-mono font-semibold">{booking.booking_no}</span>
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-bold">{t.summary}</h2>
        <dl className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200 text-sm">
          {lines.map((line, index) => (
            <Fragment key={index}>
              <Row label={multi ? t.itemN(index + 1) : t.item} value={styleName(line.style_id)} strong={multi} />
              <Row label={t.size} value={sizeLabel(line.size, locale)} />
              <Row
                label={t.dates}
                value={`${formatDate(line.start_date, locale)} – ${formatDate(line.end_date, locale)}${t.days(line.rental_days)}`}
              />
              {!sameDates && <Row label={t.handover} value={handover(line)} />}
              <Row label={t.rental} value={formatMoney(line.rental_cents)} />
            </Fragment>
          ))}
          {addOns.map((addOn, index) => (
            <Row
              key={index}
              label={t.addOnRow(styleName(addOn.style_id))}
              value={formatMoney(addOn.rental_cents)}
            />
          ))}
          <Row label={t.fulfillment} value={messages.fulfillment[booking.fulfillment_method]} />
          {sameDates && <Row label={t.handover} value={handover(booking)} />}
          {booking.fulfillment_method === "shipping" && (
            <Row
              label={t.shipping}
              value={
                (pay?.rush_fee_cents ?? 0) > 0
                  ? t.shippingWithRush(formatMoney(booking.shipping_cents), formatMoney(pay!.rush_fee_cents))
                  : booking.shipping_cents > 0
                    ? formatMoney(booking.shipping_cents)
                    : t.freeShipping
              }
            />
          )}
          {depositCents > 0 && <Row label={t.deposit} value={formatMoney(depositCents)} />}
          <Row label={t.total} value={formatMoney(totalCents)} strong />
        </dl>
      </section>

      {status === "returned" && (
        <section id="review" className="mt-10 scroll-mt-24 border-t border-neutral-200 pt-8">
          <h2 className="text-base font-bold">{tr.formTitle}</h2>
          <p className="mt-1 text-sm text-neutral-600">{multi ? tr.formIntroMulti : tr.formIntro}</p>
          {lines.map((line) => {
            const review = reviews.find((rv) => rv.booking_id === line.id);
            return (
              <div key={line.id} className={multi ? "mt-8 border-t border-neutral-200 pt-6 first-of-type:border-0" : "mt-5"}>
                {multi && <h3 className="mb-4 text-sm font-semibold">{styleName(line.style_id)}</h3>}
                {review ? (
                  <>
                    <p className="text-sm font-semibold">{tr.yourReview}</p>
                    <p className="mt-2 text-lg tracking-widest" aria-label={tr.stars(review.rating)}>
                      {"★".repeat(review.rating)}
                      <span className="text-neutral-300">{"★".repeat(5 - review.rating)}</span>
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{review.body}</p>
                    <p className="mt-1 text-sm text-neutral-500">— {review.display_name}</p>
                    <p className="mt-3 text-sm text-neutral-500">{tr.thanksTitle}</p>
                  </>
                ) : (
                  <ReviewForm lineNo={line.booking_no} locale={locale} />
                )}
              </div>
            );
          })}
        </section>
      )}

      <p className="mt-8 text-sm text-neutral-600">
        {t.questions}
        <Link href={localePath(locale, "/contact")} className="ml-1 underline underline-offset-4">
          {t.contact}
        </Link>
      </p>
    </article>
  );
}

/** Shown instead of the order to anyone else: sign in with the order's email, or switch accounts */
function OrderLocked({ access, bookingNo, locale }: { access: OrderAccess; bookingNo: string; locale: Locale }) {
  const t = getMessages(locale).bookingPage;
  const next = localePath(locale, `/booking/${bookingNo}`);
  return (
    <article>
      <p className="text-xs uppercase tracking-widest text-neutral-500">{t.number}</p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{bookingNo}</p>
      <h1 className="mt-8 text-2xl font-black leading-snug">{t.accessTitle}</h1>
      <p className="mt-2 text-neutral-700">{access === "other_account" ? t.accessOtherAccount : t.accessBody}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {access === "signed_out" ? (
          <>
            <Link
              href={`${localePath(locale, "/login")}?${new URLSearchParams({ next })}`}
              className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-bold text-white hover:bg-neutral-700"
            >
              {t.accessLogin}
            </Link>
            <Link
              href={localePath(locale, "/signup")}
              className="inline-flex h-11 items-center rounded-full border border-neutral-900 px-6 text-sm font-bold hover:bg-neutral-100"
            >
              {t.accessSignup}
            </Link>
          </>
        ) : (
          <Link
            href={localePath(locale, "/account")}
            className="inline-flex h-11 items-center rounded-full border border-neutral-900 px-6 text-sm font-bold hover:bg-neutral-100"
          >
            {t.accessAccount}
          </Link>
        )}
      </div>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className={strong ? "text-right font-bold" : "text-right font-medium"}>{value}</dd>
    </div>
  );
}

function BookingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-4 w-24 animate-pulse bg-neutral-100" />
      <div className="h-8 w-48 animate-pulse bg-neutral-100" />
      <div className="h-8 w-2/3 animate-pulse bg-neutral-100" />
      <div className="h-48 animate-pulse bg-neutral-100" />
    </div>
  );
}
