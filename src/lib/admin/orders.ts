import { ADMIN_FILTERS, type AdminFilterKey } from "@/lib/booking/status";
import type { BookingRow, BookingStatus } from "@/lib/supabase/database.types";

export const ADMIN_PAGE_SIZE = 50;

/** The parts of a Supabase query this loader uses (so tests can pass an in-memory table) */
interface Query<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }> {
  is(column: string, value: null): Query<T>;
  in(column: string, values: readonly string[]): Query<T>;
  eq(column: string, value: string): Query<T>;
  not(column: string, operator: "is", value: null): Query<T>;
  order(column: string, options: { ascending: boolean }): Query<T>;
  range(from: number, to: number): Query<T>;
}

export interface OrdersClient {
  from(table: "bookings"): {
    select(columns: string, options?: { count: "exact"; head?: boolean }): Query<BookingRow>;
  };
}

export interface AdminOrders {
  /** Main orders on this page, newest first */
  orders: BookingRow[];
  /** Their child orders (other cart items, add-ons, set pieces) */
  children: BookingRow[];
  /** Main orders per filter tab, counted in the database (not just the ones loaded) */
  counts: Record<AdminFilterKey, number>;
  /** Paid short-notice orders waiting for the owner, whatever tab is open */
  awaitingCount: number;
  page: number;
  pageCount: number;
}

const statusesOf = (filter: AdminFilterKey): readonly BookingStatus[] | null =>
  ADMIN_FILTERS.find((f) => f.key === filter)?.statuses ?? null;

function check<T>(result: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (result.error) throw new Error(`${what}：${result.error.message}`);
  return result.data ?? [];
}

/**
 * The admin order list: main orders filtered by status and paged in the database, so old pending or picked-up orders are
 * never pushed out by newer ones; then all child orders of that page; and a database count for every tab.
 */
export async function loadAdminOrders(client: OrdersClient, filter: AdminFilterKey, page: number): Promise<AdminOrders> {
  const mains = () => client.from("bookings");
  const byStatus = <T>(query: Query<T>, statuses: readonly BookingStatus[] | null) =>
    statuses ? query.in("status", statuses) : query;

  const from = (Math.max(1, page) - 1) * ADMIN_PAGE_SIZE;
  const [list, awaiting, ...tabCounts] = await Promise.all([
    byStatus(mains().select("*", { count: "exact" }).is("parent_booking_id", null), statusesOf(filter))
      .order("created_at", { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1),
    mains()
      .select("id", { count: "exact", head: true })
      .is("parent_booking_id", null)
      .eq("status", "pending")
      .eq("acceptance_status", "awaiting")
      .not("paid_at", "is", null),
    ...ADMIN_FILTERS.map((f) =>
      byStatus(mains().select("id", { count: "exact", head: true }).is("parent_booking_id", null), f.statuses),
    ),
  ]);
  const orders = check(list, "读取订单失败");

  const children =
    orders.length > 0
      ? check(
          await mains()
            .select("*")
            .in("parent_booking_id", orders.map((o) => o.id))
            .order("created_at", { ascending: true }),
          "读取子订单失败",
        )
      : [];

  for (const r of [awaiting, ...tabCounts]) if (r.error) throw new Error(`统计订单失败：${r.error.message}`);
  const counts = Object.fromEntries(ADMIN_FILTERS.map((f, i) => [f.key, tabCounts[i].count ?? 0])) as Record<AdminFilterKey, number>;
  const total = list.count ?? orders.length;
  return {
    orders,
    children,
    counts,
    awaitingCount: awaiting.count ?? 0,
    page: Math.max(1, page),
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}
