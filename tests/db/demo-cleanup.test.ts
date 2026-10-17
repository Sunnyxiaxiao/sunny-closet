import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { afterEach, describe, expect, it } from "vitest";
import { migrationFiles } from "../helpers/test-db";

const CLEANUP = "20261017000004_brand_category.sql";

let db: PGlite | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

/** 建一个停在“第一版”结构上的数据库，放入旧演示款式（含儿童款）和一条订单 */
async function dbBeforeCleanup(customerEmail: string) {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync(join(process.cwd(), "tests", "db", "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles().filter((f) => f < join(process.cwd(), "supabase", "migrations", CLEANUP))) {
    await db.exec(readFileSync(file, "utf8"));
  }
  await db.exec(`
    insert into public.styles (slug, name, daily_price_cents, deposit_cents)
      values ('kids-ski-suit', '儿童雪服套装', 1800, 8000), ('keep-me', '保留的款式', 1000, 0);
    insert into public.inventory_items (style_id, size, code)
      select id, '110', 'KS-110-01' from public.styles where slug = 'kids-ski-suit';
  `);
  await db.query(
    `insert into public.bookings (
       booking_no, style_id, inventory_item_id, size, start_date, end_date, buffer_days, status,
       fulfillment_method, customer_name, customer_email, customer_phone,
       rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents
     )
     select public.generate_booking_no(), s.id, i.id, '110', '2026-01-10', '2026-01-10', 1, 'confirmed',
       'pickup', 'x', $1, '1', 1, 1800, 1800, 8000, 9800
     from public.styles s join public.inventory_items i on i.style_id = s.id
     where s.slug = 'kids-ski-suit'`,
    [customerEmail],
  );
  return db;
}

function runCleanup(target: PGlite) {
  return target.exec(readFileSync(join(process.cwd(), "supabase", "migrations", CLEANUP), "utf8"));
}

describe("清理第一版演示数据", () => {
  it("删除旧演示款式、库存和演示订单，保留其他款式", async () => {
    const target = await dbBeforeCleanup("demo@example.com");
    await runCleanup(target);
    const slugs = (await target.query<{ slug: string }>("select slug from public.styles")).rows;
    expect(slugs.map((r) => r.slug)).toEqual(["keep-me"]);
    const counts = await target.query<{ items: number; bookings: number }>(
      "select (select count(*) from public.inventory_items)::int as items, (select count(*) from public.bookings)::int as bookings",
    );
    expect(counts.rows[0]).toEqual({ items: 0, bookings: 0 });
  });

  it("如果旧款式上有真实订单，拒绝删除而不是误删", async () => {
    const target = await dbBeforeCleanup("real-customer@example.com");
    await expect(runCleanup(target)).rejects.toThrow(/foreign key/);
  });
});
