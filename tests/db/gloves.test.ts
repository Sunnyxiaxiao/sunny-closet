import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// Crystal Collection 手套：1 天 $15、2–3 天 $22、4–7 天 $28
const GLOVES_PRICES = [1500, 2200, 2200, 2800];

let db: PGlite;
let glovesId: string;

function book(start: string, end: string, rental: number, size = "芭比玫红 · S") {
  return withRole(db, "service_role", () =>
    db.query<{ booking_no: string }>(
      `select * from public.create_booking(
         $1, $2, $3, $4, '顾客', 'a@b.co', '5551234567', 'pickup', null, '',
         1000, $5, 0)`,
      [glovesId, size, start, end, rental],
    ),
  );
}

beforeAll(async () => {
  db = await createTestDb();
  const res = await db.query<{ id: string }>(
    `insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, rental_prices_cents, variant_images)
     values ('gloves', '手套', 'gloves', 1500, 0, $1, '{"芭比玫红 · S": 0, "芭蕾粉 · S": 3}') returning id`,
    [GLOVES_PRICES],
  );
  glovesId = res.rows[0].id;
  await db.query(
    "insert into public.inventory_items (style_id, size, code) values ($1, '芭比玫红 · S', 'GL1'), ($1, '芭蕾粉 · S', 'GL2')",
    [glovesId],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("手套", () => {
  it("价目表：1 天 $15、2–3 天 $22、4 天起都是 $28", async () => {
    const res = await db.query<{ cents: number }>(
      "select public.style_rental_price_cents($1, d) as cents from generate_series(1, 7) d order by d",
      [glovesId],
    );
    expect(res.rows.map((r) => r.cents)).toEqual([1500, 2200, 2200, 2800, 2800, 2800, 2800]);
  });

  it("必须有自己的价目表", async () => {
    await expect(
      db.query(
        "insert into public.styles (slug, name, category, daily_price_cents, deposit_cents) values ('g2', 'g2', 'gloves', 1000, 0)",
      ),
    ).rejects.toThrow(/styles_gloves_fields/);
  });

  it("按颜色预订：同一颜色日期重叠时拒绝，另一个颜色仍可订", async () => {
    await expect(book("2026-02-02", "2026-02-06", 2800)).resolves.toBeTruthy();
    await expect(book("2026-02-04", "2026-02-04", 1500)).rejects.toThrow(/no_availability/);
    await expect(book("2026-02-04", "2026-02-04", 1500, "芭蕾粉 · S")).resolves.toBeTruthy();
  });

  it("单租手套最长 10 天（雪服仍是 7 天）：10 天 $28 可订，11 天拒绝", async () => {
    await expect(book("2026-04-01", "2026-04-10", 2800)).resolves.toBeTruthy();
    await expect(book("2026-04-20", "2026-04-30", 2800)).rejects.toThrow(/rental_too_long/);
  });

  it("价格对不上时拒绝（例如按普通手套的 $25 计算）", async () => {
    await expect(book("2026-03-02", "2026-03-06", 2500)).rejects.toThrow(/price_changed/);
  });

  // 2/8 滑雪要 2/7 晚取件：芭比玫红（2/2–2/6，占到 2/8 清洁）不可租，芭蕾粉（2/4，占到 2/6）可租
  it("可用性查询按颜色返回", async () => {
    const res = await withRole(db, "anon", () =>
      db.query<{ size: string; available_count: number }>(
        "select size, available_count from public.get_availability('2026-02-08', '2026-02-08', $1) order by size",
        [glovesId],
      ),
    );
    expect(res.rows).toEqual([
      { size: "芭比玫红 · S", available_count: 0 },
      { size: "芭蕾粉 · S", available_count: 1 },
    ]);
  });

  it("variant_images 必须是对象", async () => {
    await expect(db.query("update public.styles set variant_images = '[]' where id = $1", [glovesId])).rejects.toThrow(
      /variant_images/,
    );
  });
});
