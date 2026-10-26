import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// Mix & Match 价目表（美分，第 n 项 = 租 n 天）
const SUIT = [4900, 7900, 9400, 10900, 11900, 12900, 13900];
const JACKET = [3500, 5000, 6000, 7000, 8000, 8500, 9000];
const PANTS = [2500, 3500, 4500, 5500, 6500, 7000, 7500];

let db: PGlite;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDb();
  for (const [slug, category, tags] of [
    ["suit", "suit", []],
    ["one-piece", "one_piece", []],
    ["jacket", "jacket", []],
    ["pants", "pants", []],
    ["bib-pants", "pants", ["bib"]],
    ["hoodie", "jacket", ["hoodie"]],
    ["crystal-suit", "suit", ["crystal"]],
    ["crystal-jacket", "jacket", ["crystal"]],
  ] as const) {
    const res = await db.query<{ id: string }>(
      "insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, tags) values ($1, $1, $2, 4900, 20000, $3) returning id",
      [slug, category, tags],
    );
    ids[slug] = res.rows[0].id;
    await db.query("insert into public.inventory_items (style_id, size, code) values ($1, 'M', $2)", [
      ids[slug],
      `C-${slug}`,
    ]);
  }
});

afterAll(async () => {
  await db?.close();
});

async function table(slug: string) {
  const res = await db.query<{ cents: number }>(
    "select public.style_rental_price_cents($1, d) as cents from generate_series(1, 7) d order by d",
    [ids[slug]],
  );
  return res.rows.map((r) => r.cents);
}

describe("Mix & Match 按品类计价", () => {
  it("成套和连体服用完整套装价目表", async () => {
    expect(await table("suit")).toEqual(SUIT);
    expect(await table("one-piece")).toEqual(SUIT);
  });

  it("只租外套、只租雪裤各用自己的价目表", async () => {
    expect(await table("jacket")).toEqual(JACKET);
    expect(await table("pants")).toEqual(PANTS);
  });

  it("Crystal 款：特惠期内按普通价，过了截止日（或没有特惠）按正价", async () => {
    await db.query("update public.settings set crystal_promo_ends_on = current_date + 30 where id");
    expect(await table("crystal-suit")).toEqual(SUIT);
    expect(await table("crystal-jacket")).toEqual(JACKET);

    await db.query("update public.settings set crystal_promo_ends_on = current_date - 30 where id");
    expect(await table("crystal-suit")).toEqual([5900, 9500, 11300, 13100, 14300, 15500, 16700]);
    expect(await table("crystal-jacket")).toEqual([4200, 6000, 7200, 8400, 9600, 10200, 10800]);

    await db.query("update public.settings set crystal_promo_ends_on = null where id");
    expect(await table("crystal-suit")).toEqual([5900, 9500, 11300, 13100, 14300, 15500, 16700]);
    expect(await table("suit")).toEqual(SUIT);
  });

  it("背带雪裤按外套价，卫衣按雪裤价", async () => {
    expect(await table("bib-pants")).toEqual(JACKET);
    expect(await table("hoodie")).toEqual(PANTS);
  });

  it("下单时按品类校验：雪裤 3 天收 $45，按套装价 $94 提交会被拒绝", async () => {
    const book = (rental: number) =>
      withRole(db, "service_role", () =>
        db.query(
          `select * from public.create_booking(
             $1, 'M', '2026-02-02', '2026-02-04', '顾客', 'a@b.co', '5551234567', 'pickup', null, '',
             0, $2, 20000)`,
          [ids.pants, rental],
        ),
      );
    await expect(book(9400)).rejects.toThrow(/price_changed/);
    await expect(book(4500)).resolves.toBeTruthy();
  });
});
