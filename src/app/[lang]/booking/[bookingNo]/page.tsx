import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
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

  const { data: addOns, error: addOnError } = await service
    .from("bookings")
    .select("style_id, rental_cents, total_cents")
    .eq("parent_booking_id", booking.id)
    .order("booking_no");
  if (addOnError) throw new Error(`读取加购失败：${addOnError.message}`);

  const { data: styles } = await createSupabasePublicClient()
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [booking.style_id, ...addOns.map((a) => a.style_id)]);
  const styleName = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    const name = locale === "en" && s?.name_en ? s.name_en : s?.name;
    return [s?.brand, name].filter(Boolean).join(" ") || "—";
  };
  const totalCents = booking.total_cents + addOns.reduce((sum, a) => sum + a.total_cents, 0);

  const status = booking.status;

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
          <Row label={t.item} value={styleName(booking.style_id)} />
          <Row label={t.size} value={sizeLabel(booking.size, locale)} />
          <Row
            label={t.dates}
            value={`${formatDate(booking.start_date, locale)} – ${formatDate(booking.end_date, locale)}${t.days(booking.rental_days)}`}
          />
          <Row label={t.fulfillment} value={messages.fulfillment[booking.fulfillment_method]} />
          <Row
            label={t.handover}
            value={handoverText(
              { start: booking.start_date as IsoDate, end: booking.end_date as IsoDate },
              booking.fulfillment_method,
              { leadDays: booking.lead_days, tailDays: booking.tail_days },
              locale,
            )}
          />
          <Row label={t.rental} value={formatMoney(booking.rental_cents)} />
          {addOns.map((addOn, index) => (
            <Row
              key={index}
              label={t.addOnRow(styleName(addOn.style_id))}
              value={formatMoney(addOn.rental_cents)}
            />
          ))}
          {booking.deposit_cents > 0 && <Row label={t.deposit} value={formatMoney(booking.deposit_cents)} />}
          <Row label={t.total} value={formatMoney(totalCents)} strong />
        </dl>
      </section>

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
