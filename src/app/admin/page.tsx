import Link from "next/link";
import { Suspense } from "react";
import { AdminEmailAlerts } from "@/components/admin-email-alerts";
import { AdminNav } from "@/components/admin-nav";
import { AdminOrderCard } from "@/components/admin-order-card";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { todayIn } from "@/lib/dates";
import { ACCEPT_WINDOW_HOURS } from "@/lib/booking/acceptance";
import { unsentFilter } from "@/lib/email/delivery";
import { stripeEnabled } from "@/lib/stripe";
import type { CardChargeRow } from "@/lib/supabase/database.types";
import { ADMIN_FILTERS, parseAdminFilter } from "@/lib/booking/status";
import { loadAdminOrders, type OrdersClient } from "@/lib/admin/orders";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<OrdersSkeleton />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const { supabase } = await requireAdmin();
  const filter = parseAdminFilter((await searchParams).status);

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  // 在数据库里按状态筛选、分页、计数（再老的待处理、未归还订单也不会被新订单挤掉）
  const { orders, children, counts, awaitingCount, pageCount } = await loadAdminOrders(
    supabase as unknown as OrdersClient,
    filter,
    page,
  );
  const bookings = [...orders, ...children];

  const styleIds = [...new Set(bookings.map((b) => b.style_id))];
  const itemIds = [...new Set(bookings.map((b) => b.inventory_item_id))];
  const [styles, items, pendingReviews, settings, overdueConflicts, unsentEmails] = await Promise.all([
    supabase.from("styles").select("id, name, brand").in("id", styleIds),
    supabase.from("inventory_items").select("id, code").in("id", itemIds),
    supabase.rpc("admin_list_reviews", undefined, { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("settings").select("overdue_hold_days").single(),
    supabase.rpc("overdue_conflicts"),
    // Order emails that failed (or got cut off mid-send), whichever page their order is on
    supabase
      .from("email_log")
      .select("id, booking_id, kind, attempts, last_error")
      .or(unsentFilter())
      .order("created_at")
      .limit(20),
  ]);
  if (styles.error) throw new Error(`读取款式失败：${styles.error.message}`);
  if (items.error) throw new Error(`读取库存失败：${items.error.message}`);
  if (settings.error) throw new Error(`读取设置失败：${settings.error.message}`);
  if (overdueConflicts.error) throw new Error(`读取逾期冲突失败：${overdueConflicts.error.message}`);
  if (unsentEmails.error) throw new Error(`读取邮件记录失败：${unsentEmails.error.message}`);
  const emailOrders = unsentEmails.data.length
    ? ((await supabase.from("bookings").select("id, booking_no").in("id", [...new Set(unsentEmails.data.map((e) => e.booking_id))])).data ?? [])
    : [];
  const emailOrderNos = new Map(emailOrders.map((b) => [b.id, b.booking_no]));
  const today = todayIn(shop.timeZone);

  const styleNames = new Map(
    styles.data.map((s) => [s.id, [s.brand, s.name].filter(Boolean).join(" ")]),
  );
  const itemCodes = new Map(items.data.map((i) => [i.id, i.code]));

  // 购物车里的其他件、加购的头盔套、组合套装里的其他单品是子订单，显示在主订单的卡片里，状态跟着主订单走
  const addOnsByParent = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (!b.parent_booking_id) continue;
    addOnsByParent.set(b.parent_booking_id, [...(addOnsByParent.get(b.parent_booking_id) ?? []), b]);
  }

  // 逾期件撞上的已有订单，归到逾期的那张主订单（逾期的可能是它的子订单，不一定在这一页）
  const lateIds = [...new Set(overdueConflicts.data.map((c) => c.late_booking_id))];
  const lateRows = lateIds.length
    ? ((await supabase.from("bookings").select("id, parent_booking_id").in("id", lateIds)).data ?? [])
    : [];
  const parentOf = new Map(lateRows.map((b) => [b.id, b.parent_booking_id ?? b.id]));
  const conflictsByOrder = new Map<string, { bookingNo: string; startDate: string; itemCode: string }[]>();
  for (const c of overdueConflicts.data) {
    const main = parentOf.get(c.late_booking_id) ?? c.late_booking_id;
    conflictsByOrder.set(main, [
      ...(conflictsByOrder.get(main) ?? []),
      { bookingNo: c.booking_no, startDate: c.start_date, itemCode: c.item_code },
    ]);
  }

  // Charges made later against the card a customer paid with (only when Stripe is configured)
  const chargesByOrder = new Map<string, CardChargeRow[]>();
  if (stripeEnabled() && orders.length > 0) {
    const { data: charges, error: chargeError } = await supabase
      .from("card_charges")
      .select("*")
      .in("booking_id", orders.map((b) => b.id))
      .order("created_at");
    if (chargeError) throw new Error(`读取押金扣款失败：${chargeError.message}`);
    for (const c of charges) chargesByOrder.set(c.booking_id, [...(chargesByOrder.get(c.booking_id) ?? []), c]);
  }

  return (
    <>
      <AdminNav current="orders" />
      <AdminEmailAlerts
        emails={unsentEmails.data.map((e) => ({
          id: e.id,
          bookingNo: emailOrderNos.get(e.booking_id) ?? "—",
          kind: e.kind,
          attempts: e.attempts,
          lastError: e.last_error,
        }))}
      />
      {(pendingReviews.count ?? 0) > 0 && (
        <Link
          href="/admin/reviews"
          className="mt-4 flex items-center justify-between bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>有 {pendingReviews.count} 条新评价等你审核</span>
          <span className="font-semibold">去看看 →</span>
        </Link>
      )}

      {awaitingCount > 0 && (
        <Link
          href="/admin?status=pending"
          className="mt-4 flex items-center justify-between bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span>有 {awaitingCount} 张已付款的急单等你接单或拒单（{ACCEPT_WINDOW_HOURS} 小时内没处理会自动拒单）</span>
          <span className="font-semibold">去处理 →</span>
        </Link>
      )}

      {overdueConflicts.data.length > 0 && (
        <Link
          href="/admin?status=picked_up"
          className="mt-4 block bg-red-50 px-4 py-3 text-sm text-red-900 hover:bg-red-100"
        >
          <span className="font-semibold">逾期件冲突：</span>
          {overdueConflicts.data.map((c) => `${c.late_booking_no} 还没还，影响 ${c.booking_no}（${c.start_date} 开始）`).join("；")}
          <span className="ml-2 font-semibold">去处理 →</span>
        </Link>
      )}

      <nav className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" aria-label={t.ordersTitle}>
        {ADMIN_FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={`/admin?status=${f.key}`}
              aria-current={active ? "page" : undefined}
              className={[
                "shrink-0 border px-4 py-2 text-sm font-semibold transition",
                active
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 hover:border-neutral-900",
              ].join(" ")}
            >
              {t.filters[f.key]}
              <span className="ml-1.5 opacity-70">{counts[f.key]}</span>
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="mt-10 text-center text-neutral-500">{t.empty}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((booking) => (
            <AdminOrderCard
              key={booking.id}
              booking={booking}
              styleName={styleNames.get(booking.style_id) ?? "—"}
              itemCode={itemCodes.get(booking.inventory_item_id) ?? "—"}
              addOns={(addOnsByParent.get(booking.id) ?? []).map((a) => ({
                name: styleNames.get(a.style_id) ?? "—",
                itemCode: itemCodes.get(a.inventory_item_id) ?? "—",
                cents: a.total_cents,
                bundlePart: a.bundle_part,
                cartItem: a.cart_item ? a : undefined,
              }))}
              cardCharges={stripeEnabled() ? (chargesByOrder.get(booking.id) ?? []) : undefined}
              conditions={[booking, ...(addOnsByParent.get(booking.id) ?? [])].flatMap((b) =>
                b.condition_snapshot
                  ? [{ name: styleNames.get(b.style_id) ?? "—", snapshot: b.condition_snapshot, acknowledgedAt: b.condition_acknowledged_at }]
                  : [],
              )}
              overdue={{
                today,
                holdDays: settings.data.overdue_hold_days,
                conflicts: conflictsByOrder.get(booking.id) ?? [],
              }}
            />
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="分页">
          {page > 1 && (
            <Link href={`/admin?status=${filter}&page=${page - 1}`} className="border border-neutral-300 px-4 py-2 font-semibold hover:border-neutral-900">
              ← 上一页
            </Link>
          )}
          <span className="text-neutral-500">
            第 {page} / {pageCount} 页
          </span>
          {page < pageCount && (
            <Link href={`/admin?status=${filter}&page=${page + 1}`} className="border border-neutral-300 px-4 py-2 font-semibold hover:border-neutral-900">
              下一页 →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-40 animate-pulse bg-neutral-100" />
      <div className="h-10 w-full animate-pulse bg-neutral-100" />
      <div className="h-56 animate-pulse bg-neutral-100" />
      <div className="h-56 animate-pulse bg-neutral-100" />
    </div>
  );
}
