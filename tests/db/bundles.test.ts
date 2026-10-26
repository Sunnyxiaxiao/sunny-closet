import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 组合套装：卫衣 + 雪裤各自有库存，套装本身没有库存
let db: PGlite;
const ids: Record<string, string> = {};

function book(slug: string, start: string, end: string, rental: number, deposit: number) {
  return withRole(db, "service_role", () =>
    db.query<{ booking_no: string; booking_id: string }>(
      `select * from public.create_booking(
         $1, 'M', $2, $3, '顾客', 'a@b.co', '5551234567', 'pickup', null, '',
         0, $4, $5)`,
      [ids[slug], start, end, rental, deposit],
    ),
  );
}

function available(slug: string, start: string, end: string) {
  return withRole(db, "anon", () =>
    db.query<{ size: string; total_count: number; available_count: number }>(
      "select size, total_count, available_count from public.get_availability($1, $2, $3)",
      [start, end, ids[slug]],
    ),
  ).then((r) => r.rows);
}

beforeAll(async () => {
  db = await createTestDb();
  for (const [slug, category, deposit] of [
    ["hoodie", "jacket", 15000],
    ["pants", "pants", 10000],
  ] as const) {
    const res = await db.query<{ id: string }>(
      "insert into public.styles (slug, name, category, daily_price_cents, deposit_cents) values ($1, $1, $2, 3500, $3) returning id",
      [slug, category, deposit],
    );
    ids[slug] = res.rows[0].id;
    await db.query("insert into public.inventory_items (style_id, size, code) values ($1, 'M', $2)", [
      ids[slug],
      `C-${slug}`,
    ]);
  }
  const res = await db.query<{ id: string }>(
    `insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, bundle_style_ids)
     values ('set', 'set', 'suit', 4900, 20000, $1) returning id`,
    [[ids.hoodie, ids.pants]],
  );
  ids.set = res.rows[0].id;
});

afterAll(async () => {
  await db?.close();
});

describe("组合套装", () => {
  it("可租件数取各单品的最小值", async () => {
    expect(await available("set", "2026-02-02", "2026-02-02")).toEqual([
      { size: "M", total_count: 1, available_count: 1 },
    ]);
  });

  it("订整套：同时占用卫衣和雪裤，主订单记在套装名下，雪裤是 0 元子订单", async () => {
    const res = await book("set", "2026-02-02", "2026-02-03", 7900, 20000);
    const rows = await db.query<{ style_id: string; rental_cents: number; bundle_part: boolean; parent: boolean }>(
      "select style_id, rental_cents, bundle_part, parent_booking_id is not null as parent from public.bookings where booking_no like $1 || '%' order by booking_no",
      [res.rows[0].booking_no],
    );
    expect(rows.rows).toEqual([
      { style_id: ids.set, rental_cents: 7900, bundle_part: false, parent: false },
      { style_id: ids.pants, rental_cents: 0, bundle_part: true, parent: true },
    ]);
    expect(await available("hoodie", "2026-02-03", "2026-02-03")).toEqual([
      { size: "M", total_count: 1, available_count: 0 },
    ]);
    expect(await available("set", "2026-02-03", "2026-02-03")).toEqual([
      { size: "M", total_count: 1, available_count: 0 },
    ]);
  });

  it("单租的雪裤被订走时，整套也订不了（整单回滚，卫衣不会被占用）", async () => {
    await book("pants", "2026-03-02", "2026-03-02", 2500, 10000);
    await expect(book("set", "2026-03-02", "2026-03-02", 4900, 20000)).rejects.toThrow(/no_availability/);
    await expect(book("hoodie", "2026-03-02", "2026-03-02", 3500, 15000)).resolves.toBeTruthy();
  });

  it("套装按完整套装价目表收费", async () => {
    await expect(book("set", "2026-04-02", "2026-04-02", 3500, 20000)).rejects.toThrow(/price_changed/);
  });

  it("只有上衣的“上衣 + 随机黑色雪裤”：按套装价收费，占用上衣的库存", async () => {
    const res = await db.query<{ id: string }>(
      `insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, bundle_style_ids, tags)
       values ('hoodie-plus', 'hoodie-plus', 'suit', 4900, 20000, $1, '{with-black-pants}') returning id`,
      [[ids.hoodie]],
    );
    ids["hoodie-plus"] = res.rows[0].id;
    expect(await available("hoodie-plus", "2026-05-02", "2026-05-02")).toEqual([
      { size: "M", total_count: 1, available_count: 1 },
    ]);
    await expect(book("hoodie-plus", "2026-05-02", "2026-05-02", 3500, 20000)).rejects.toThrow(/price_changed/);
    await book("hoodie-plus", "2026-05-02", "2026-05-02", 4900, 20000);
    expect(await available("hoodie", "2026-05-02", "2026-05-02")).toEqual([
      { size: "M", total_count: 1, available_count: 0 },
    ]);
    // 已有订单不能删，下架以免影响下面的查询
    await db.query("update public.styles set is_active = false where id = $1", [ids["hoodie-plus"]]);
  });

  it("套装最多 5 件，不能是空的", async () => {
    await expect(
      db.query("update public.styles set bundle_style_ids = '{}' where id = $1", [ids.set]),
    ).rejects.toThrow();
  });

  it("不带款式查询时，套装和单品都在结果里", async () => {
    const res = await withRole(db, "anon", () =>
      db.query<{ style_id: string }>("select style_id from public.get_availability()"),
    );
    expect(new Set(res.rows.map((r) => r.style_id))).toEqual(new Set([ids.hoodie, ids.pants, ids.set]));
  });
});
