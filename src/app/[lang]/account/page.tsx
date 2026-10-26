import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOutCustomer } from "@/app/[lang]/account/actions";
import { ProfileForm } from "@/components/account-forms";
import { AuthSkeleton } from "@/components/auth-shell";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getCustomer, type Customer } from "@/lib/account/customer";
import { formatDateRange, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).account.title, robots: { index: false } };
}

export default async function AccountPage({ searchParams }: PageProps<"/[lang]/account">) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<AuthSkeleton />}>
        <AccountBody locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountBody({
  locale,
  searchParams,
}: { locale: Locale } & Pick<PageProps<"/[lang]/account">, "searchParams">) {
  const t = getMessages(locale).account;
  const customer = await getCustomer();
  if (!customer) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, "/account"))}`);
  const [{ password }, isAdmin] = await Promise.all([searchParams, checkIsAdmin()]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">{t.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {t.hello(customer.profile.full_name)} · {customer.user.email}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {/* 只有管理员账号看得到；后台页面自己也会再检查一次 */}
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex h-9 items-center rounded-full bg-neutral-900 px-4 text-xs font-bold tracking-wider text-white hover:bg-neutral-700"
            >
              {t.adminLink} →
            </Link>
          )}
          <form action={signOutCustomer}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="text-sm underline underline-offset-4 hover:text-neutral-600">
              {t.signOut}
            </button>
          </form>
        </div>
      </div>
      {password === "updated" && (
        <p role="status" className="mt-4 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t.passwordUpdated}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-bold">{t.bookingsTitle}</h2>
        <MyBookings customer={customer} locale={locale} />
      </section>

      <section className="mt-12 border-t border-neutral-200 pt-8">
        <h2 className="text-lg font-bold">{t.profileTitle}</h2>
        <p className="mt-1 text-sm text-neutral-500">{t.profileHint}</p>
        <div className="mt-5 max-w-md">
          <ProfileForm
            locale={locale}
            initial={{ name: customer.profile.full_name, phone: customer.profile.phone, wechat: customer.profile.wechat }}
          />
        </div>
        <Link
          href={localePath(locale, "/account/reset-password")}
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          {t.changePassword}
        </Link>
      </section>
    </>
  );
}

/** 当前登录的账号是不是管理员（和后台用的是同一个检查） */
async function checkIsAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("is_admin");
  return data === true;
}

/**
 * 我的预订：登录后下的单（user_id），以及用这个已确认邮箱下的单。
 * 订单表顾客不能直接查，这里由服务端按账号筛好再显示，只取展示需要的字段。
 */
async function MyBookings({ customer, locale }: { customer: Customer; locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.account;
  const service = createSupabaseServiceClient();
  const email = customer.user.email_confirmed_at ? customer.user.email?.toLowerCase() : undefined;
  const filter = [`user_id.eq.${customer.user.id}`, email ? `customer_email.eq."${email}"` : null]
    .filter(Boolean)
    .join(",");
  const { data: bookings, error } = await service
    .from("bookings")
    .select("id, booking_no, style_id, status, start_date, end_date, total_cents, created_at")
    .is("parent_booking_id", null)
    .or(filter)
    .order("start_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(`读取预订失败：${error.message}`);

  if (bookings.length === 0) {
    return (
      <div className="mt-3 border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
        <p>{t.bookingsEmpty}</p>
        <Link href={localePath(locale, "/styles")} className="mt-3 inline-block font-semibold underline underline-offset-4">
          {t.browse}
        </Link>
      </div>
    );
  }

  // 购物车里的其他件、加购的头盔套是子订单，合计金额要加上
  const { data: addOns } = await service
    .from("bookings")
    .select("parent_booking_id, total_cents, cart_item")
    .in("parent_booking_id", bookings.map((b) => b.id));
  const totalOf = (id: string, own: number) =>
    own + (addOns ?? []).filter((a) => a.parent_booking_id === id).reduce((sum, a) => sum + a.total_cents, 0);
  const moreItems = (id: string) => (addOns ?? []).filter((a) => a.parent_booking_id === id && a.cart_item).length;

  const { data: styles } = await service
    .from("styles")
    .select("id, name, name_en, brand")
    .in("id", [...new Set(bookings.map((b) => b.style_id))]);
  const nameOf = (id: string) => {
    const s = styles?.find((x) => x.id === id);
    return (locale === "en" && s?.name_en) || s?.name || "—";
  };

  return (
    <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
      {bookings.map((b) => (
        <li key={b.id}>
          <Link
            href={localePath(locale, `/booking/${b.booking_no}`)}
            className="flex items-center justify-between gap-4 py-4 hover:bg-neutral-50"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {nameOf(b.style_id)}
                {moreItems(b.id) > 0 && (
                  <span className="font-normal text-neutral-500"> {t.moreItems(moreItems(b.id))}</span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {formatDateRange(b.start_date as IsoDate, b.end_date as IsoDate, locale)} ·{" "}
                {messages.bookingStatus[b.status]}
              </p>
              <p className="mt-0.5 font-mono text-xs text-neutral-500">{b.booking_no}</p>
            </div>
            <div className="shrink-0 text-right text-sm">
              <p className="font-semibold">{formatMoney(totalOf(b.id, b.total_cents))}</p>
              <p className="mt-0.5 underline underline-offset-4">{t.viewBooking}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
