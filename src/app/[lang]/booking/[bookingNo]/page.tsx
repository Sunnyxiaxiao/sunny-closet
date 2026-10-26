import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { ReviewForm } from "@/components/review-form";
import { shop } from "@/config/shop";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { handoverText } from "@/lib/booking/schedule";
import { formatDate, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages, sizeLabel } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getMessages(await getLocale()).bookingPage.metaTitle,
    robots: { index: false, follow: false },
  };
}

/** 预订编号：SC- 加 8 位（去掉了容易混淆的 0/O/1/I），先在这里挡掉明显不对的地址 */
const BOOKING_NO_RE = /^SC-[A-HJ-NP-Z2-9]{8}$/;

export default async function BookingPage({ params }: PageProps<"/[lang]/booking/[bookingNo]">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Suspense fallback={<BookingSkeleton />}>
        <BookingDetail params={params} locale={locale} />
      </Suspense>
    </div>
  );
}

async function BookingDetail({
  params,
  locale,
}: Pick<PageProps<"/[lang]/booking/[bookingNo]">, "params"> & { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.bookingPage;
  const { bookingNo } = await params;
  if (!BOOKING_NO_RE.test(bookingNo)) notFound();
  await connection();

  // 订单表不对匿名访客开放，所以这里用服务端密钥按编号查。
  // 只取展示需要的字段，不读取顾客的电话、邮箱和地址。
  const service = createSupabaseServiceClient();
  const { data: booking, error } = await service
    .from("bookings")
    .select(
      "id, booking_no, style_id, status, size, start_date, end_date, rental_days, rental_cents, deposit_cents, total_cents, fulfillment_method, parent_booking_id, lead_days, tail_days",
    )
    .eq("booking_no", bookingNo)
    .maybeSingle();
  if (error) throw new Error(`读取预订失败：${error.message}`);
  // 加购子订单没有单独的详情页，顾客只用主订单编号
  if (!booking || booking.parent_booking_id) notFound();

  const { data: children, error: childError } = await service
    .from("bookings")
    .select("id, booking_no, style_id, size, start_date, end_date, rental_days, rental_cents, deposit_cents, total_cents, lead_days, tail_days, cart_item")
    .eq("parent_booking_id", booking.id)
    // 组合套装里的其他单品是 0 元子订单，顾客只看到整套
    .eq("bundle_part", false)
    .order("booking_no");
  if (childError) throw new Error(`读取订单明细失败：${childError.message}`);
  // 购物车订单：第 1 件是主订单，其余每件是 cart_item 子订单；其他子订单是加购的头盔套
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
  // 每件日期一样时取件 / 归还只写一次
  const sameDates = lines.every((l) => l.start_date === booking.start_date && l.end_date === booking.end_date);
  const handover = (l: (typeof lines)[number]) =>
    handoverText(
      { start: l.start_date as IsoDate, end: l.end_date as IsoDate },
      booking.fulfillment_method,
      { leadDays: l.lead_days, tailDays: l.tail_days },
      locale,
    );

  const status = booking.status;
  // 已归还的订单可以写评价，买了几件就可以写几条；写过的显示自己写的那条
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

      <h1 className="mt-8 text-2xl font-black leading-snug">{t.titleByStatus[status]}</h1>
      <p className="mt-2 text-neutral-700">{t.bodyByStatus[status]}</p>
      <p className="mt-2 text-sm text-neutral-500">{t.saveHint}</p>

      {status === "confirmed" && (
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
