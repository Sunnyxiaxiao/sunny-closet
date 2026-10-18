import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { AdminOrderCard } from "@/components/admin-order-card";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ADMIN_FILTERS,
  matchesAdminFilter,
  parseAdminFilter,
} from "@/lib/booking/status";
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

  // 订单量不大，一次取最近 500 条，在内存里分类、计数
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`读取订单失败：${error.message}`);

  const styleIds = [...new Set(bookings.map((b) => b.style_id))];
  const itemIds = [...new Set(bookings.map((b) => b.inventory_item_id))];
  const [styles, items] = await Promise.all([
    supabase.from("styles").select("id, name, brand").in("id", styleIds),
    supabase.from("inventory_items").select("id, code").in("id", itemIds),
  ]);
  if (styles.error) throw new Error(`读取款式失败：${styles.error.message}`);
  if (items.error) throw new Error(`读取库存失败：${items.error.message}`);

  const styleNames = new Map(
    styles.data.map((s) => [s.id, [s.brand, s.name].filter(Boolean).join(" ")]),
  );
  const itemCodes = new Map(items.data.map((i) => [i.id, i.code]));

  // 加购的头盔套是子订单，显示在所属雪服订单的卡片里，状态跟着主订单走
  const addOnsByParent = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (!b.parent_booking_id) continue;
    addOnsByParent.set(b.parent_booking_id, [...(addOnsByParent.get(b.parent_booking_id) ?? []), b]);
  }
  const orders = bookings.filter((b) => !b.parent_booking_id);

  const counts = new Map(
    ADMIN_FILTERS.map((f) => [f.key, orders.filter((b) => matchesAdminFilter(b.status, f.key)).length]),
  );
  const visible = orders.filter((b) => matchesAdminFilter(b.status, filter));

  return (
    <>
      <AdminNav current="orders" />

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
              <span className="ml-1.5 opacity-70">{counts.get(f.key) ?? 0}</span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="mt-10 text-center text-neutral-500">{t.empty}</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {visible.map((booking) => (
            <AdminOrderCard
              key={booking.id}
              booking={booking}
              styleName={styleNames.get(booking.style_id) ?? "—"}
              itemCode={itemCodes.get(booking.inventory_item_id) ?? "—"}
              addOns={(addOnsByParent.get(booking.id) ?? []).map((a) => ({
                name: styleNames.get(a.style_id) ?? "—",
                itemCode: itemCodes.get(a.inventory_item_id) ?? "—",
                cents: a.total_cents,
              }))}
            />
          ))}
        </ul>
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
