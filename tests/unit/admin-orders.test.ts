import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE, loadAdminOrders, type OrdersClient } from "@/lib/admin/orders";
import type { BookingRow } from "@/lib/supabase/database.types";

/** In-memory bookings table answering the same query calls as Supabase (filters, newest first, ranges, exact counts) */
function fakeClient(rows: Partial<BookingRow>[]): OrdersClient {
  const query = (head: boolean, filters: ((r: Partial<BookingRow>) => boolean)[] = [], sort?: { column: string; ascending: boolean }, range?: [number, number]) => {
    const run = () => {
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (sort) {
        const key = sort.column as keyof BookingRow;
        matched = [...matched].sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1) * (sort.ascending ? 1 : -1));
      }
      const page = range ? matched.slice(range[0], range[1] + 1) : matched;
      return { data: head ? null : (page as BookingRow[]), error: null, count: matched.length };
    };
    const next = (f: (r: Partial<BookingRow>) => boolean) => query(head, [...filters, f], sort, range);
    const col = (r: Partial<BookingRow>, c: string) => r[c as keyof BookingRow];
    return {
      is: (c: string) => next((r) => col(r, c) === null || col(r, c) === undefined),
      in: (c: string, values: readonly string[]) => next((r) => values.includes(String(col(r, c)))),
      eq: (c: string, v: string) => next((r) => col(r, c) === v),
      not: (c: string) => next((r) => col(r, c) !== null && col(r, c) !== undefined),
      order: (column: string, options: { ascending: boolean }) => query(head, filters, { column, ...options }, range),
      range: (from: number, to: number) => query(head, filters, sort, [from, to]),
      then: (resolve: (v: ReturnType<typeof run>) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    } as never;
  };
  return { from: () => ({ select: (_c: string, options?: { head?: boolean }) => query(Boolean(options?.head)) }) };
}

const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();

function shop() {
  const rows: Partial<BookingRow>[] = [];
  // Two old orders still open, placed before 700 newer ones
  rows.push({ id: "old-pending", status: "pending", parent_booking_id: null, created_at: at(0) });
  rows.push({ id: "old-out", status: "picked_up", parent_booking_id: null, created_at: at(1) });
  rows.push({ id: "old-out-child", status: "picked_up", parent_booking_id: "old-out", created_at: at(1) });
  for (let i = 0; i < 700; i += 1) {
    rows.push({ id: `r${i}`, status: i % 2 ? "returned" : "cancelled", parent_booking_id: null, created_at: at(10 + i) });
    rows.push({ id: `r${i}-child`, status: i % 2 ? "returned" : "cancelled", parent_booking_id: `r${i}`, created_at: at(10 + i) });
  }
  rows.push({ id: "awaiting", status: "pending", parent_booking_id: null, acceptance_status: "awaiting", paid_at: at(800), created_at: at(800) });
  return rows;
}

describe("后台订单列表", () => {
  it("700 多条之后，老的待处理和未归还订单仍然显示（按状态在数据库里筛选）", async () => {
    const client = fakeClient(shop());
    const pending = await loadAdminOrders(client, "pending", 1);
    expect(pending.orders.map((o) => o.id)).toEqual(["awaiting", "old-pending"]);
    const out = await loadAdminOrders(client, "picked_up", 1);
    expect(out.orders.map((o) => o.id)).toEqual(["old-out"]);
    expect(out.children.map((c) => c.id)).toEqual(["old-out-child"]);
  });

  it("计数是数据库里全部的主订单，不受分页影响", async () => {
    const { counts, awaitingCount } = await loadAdminOrders(fakeClient(shop()), "pending", 1);
    expect(counts).toEqual({ pending: 2, confirmed: 0, picked_up: 1, returned: 350, closed: 350, all: 703 });
    expect(awaitingCount).toBe(1);
  });

  it("分页：每页 50 张主订单，子订单跟着自己的主订单，页数正确", async () => {
    const client = fakeClient(shop());
    const first = await loadAdminOrders(client, "returned", 1);
    expect(first.orders).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.pageCount).toBe(7);
    expect(first.children).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.children.every((c) => first.orders.some((o) => o.id === c.parent_booking_id))).toBe(true);
    const last = await loadAdminOrders(client, "returned", 7);
    expect(last.orders).toHaveLength(350 - 6 * ADMIN_PAGE_SIZE);
    const ids = new Set([...first.orders, ...last.orders].map((o) => o.id));
    expect(ids.size).toBe(ADMIN_PAGE_SIZE + 50);
  });
});
