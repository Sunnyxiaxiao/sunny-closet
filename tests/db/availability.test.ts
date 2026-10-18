import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isItemFree, type Padding } from "@/lib/booking/rules";
import { createTestDb, withRole } from "../helpers/test-db";

let db: PGlite;
let styleId: string;
let itemId: string;

async function insertBooking(start: string, end: string, bufferDays: number, status = "confirmed") {
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  await db.query(
    `insert into public.bookings (
       booking_no, style_id, inventory_item_id, size, start_date, end_date, buffer_days, status,
       fulfillment_method, customer_name, customer_email, customer_phone,
       rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
     ) values (public.generate_booking_no(), $1, $2, 'M', $3, $4, $5, $6,
       'pickup', '测试', 't@example.com', '1', $7, 1000, $8, 0, $8)`,
    [styleId, itemId, start, end, bufferDays, status, days, days * 1000],
  );
}

const PICKUP: Padding = { leadDays: 1, tailDays: 1 };
const SHIPPING: Padding = { leadDays: 3, tailDays: 4 };

async function availableCount(start: string, end: string, fulfillment = "pickup") {
  const res = await withRole(db, "anon", () =>
    db.query<{ available_count: number }>(
      "select available_count from public.get_availability($1, $2, $3, $4)",
      [start, end, styleId, fulfillment],
    ),
  );
  return res.rows[0]?.available_count ?? 0;
}

beforeAll(async () => {
  db = await createTestDb();
  const style = await db.query<{ id: string }>(
    "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ('t', '测试款', 1000, 0) returning id",
  );
  styleId = style.rows[0].id;
  const item = await db.query<{ id: string }>(
    "insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'T-M-01') returning id",
    [styleId],
  );
  itemId = item.rows[0].id;
  // 已有订单（旧订单，没有前置 / 后置天数）：1 月 10–12 号，缓冲 1 天（占用到 13 号）
  await insertBooking("2026-01-10", "2026-01-12", 1);
  // 已取消的订单不应占用
  await insertBooking("2026-01-20", "2026-01-25", 1, "cancelled");
});

afterAll(async () => {
  await db?.close();
});

describe("数据库可用性查询与前端规则一致", () => {
  const existing = [
    { range: { start: "2026-01-10", end: "2026-01-12" }, bufferDays: 1, status: "confirmed" as const },
    { range: { start: "2026-01-20", end: "2026-01-25" }, bufferDays: 1, status: "cancelled" as const },
  ];

  const cases: Array<[string, string, string]> = [
    ["当天归还当天取件", "2026-01-12", "2026-01-14"],
    ["归还次日（清洁日）取件", "2026-01-13", "2026-01-13"],
    ["归还后第 2 天取件", "2026-01-14", "2026-01-16"],
    ["只租一天，落在租期中", "2026-01-11", "2026-01-11"],
    ["新租期在前，缓冲撞上已有取件日", "2026-01-07", "2026-01-09"],
    ["新租期在前，缓冲刚好够", "2026-01-07", "2026-01-08"],
    ["完全覆盖已有租期", "2026-01-01", "2026-01-31"],
    ["与已取消订单重叠", "2026-01-21", "2026-01-22"],
    ["跨月", "2026-01-30", "2026-02-02"],
  ];

  for (const [label, start, end] of cases) {
    it(`到店自取：${label}（${start} → ${end}）`, async () => {
      const expected = isItemFree({ start, end }, 1, existing, PICKUP) ? 1 : 0;
      expect(await availableCount(start, end)).toBe(expected);
    });
    it(`邮寄：${label}（${start} → ${end}）`, async () => {
      const expected = isItemFree({ start, end }, 1, existing, SHIPPING) ? 1 : 0;
      expect(await availableCount(start, end, "shipping")).toBe(expected);
    });
  }

  it("取件前一晚和归还日不收费但占用库存：14 号滑雪要 13 号晚取件，撞上清洁日", async () => {
    expect(await availableCount("2026-01-14", "2026-01-14")).toBe(0);
    expect(await availableCount("2026-01-15", "2026-01-15")).toBe(1);
    // 邮寄要提前 3 天寄出：17 号滑雪 → 14 号寄出
    expect(await availableCount("2026-01-16", "2026-01-16", "shipping")).toBe(0);
    expect(await availableCount("2026-01-17", "2026-01-17", "shipping")).toBe(1);
  });

  it("不传日期时返回可租件总数", async () => {
    const res = await withRole(db, "anon", () =>
      db.query<{ total_count: number; available_count: number }>(
        "select total_count, available_count from public.get_availability(null, null, $1)",
        [styleId],
      ),
    );
    expect(res.rows[0]).toEqual({ total_count: 1, available_count: 1 });
  });

  it("停用的库存件不计入", async () => {
    await db.query("update public.inventory_items set status = 'inactive' where id = $1", [itemId]);
    expect(await availableCount("2026-03-01", "2026-03-02")).toBe(0);
    await db.query("update public.inventory_items set status = 'available' where id = $1", [itemId]);
  });

  it("归还日早于取件日时报错", async () => {
    await expect(availableCount("2026-01-12", "2026-01-10")).rejects.toThrow();
  });
});
