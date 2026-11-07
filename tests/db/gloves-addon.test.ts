import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 手套加购、每套衣服限一个头盔套 + 一副手套（迁移 20261106000030）
const PRICES = [4900, 7900, 9900];

let db: PGlite;
const ids: Record<string, string> = {};

async function style(slug: string, category: string, extra: { addon?: number; tags?: string[] } = {}) {
  const accessory = category === "helmet_cover" || category === "gloves";
  const res = await db.query<{ id: string }>(
    `insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, tier, addon_price_cents, rental_prices_cents, tags)
     values (lower($1), $1, $2, 0, 0, $3, $4, $5, $6) returning id`,
    [
      slug,
      category,
      category === "helmet_cover" ? "regular" : null,
      extra.addon ?? null,
      accessory ? [1000, 1800, 2500] : PRICES,
      extra.tags ?? [],
    ],
  );
  ids[slug] = res.rows[0].id;
}

async function item(slug: string, code: string, size: string) {
  await db.query("insert into public.inventory_items (style_id, size, code) values ($1, $2, $3)", [ids[slug], size, code]);
}

interface AddOn {
  style: string;
  size?: string | null;
  cents?: number;
}

interface Line {
  style: string;
  size?: string;
  addOns?: AddOn[];
}

const ADDON_CENTS: Record<string, number> = { cover: 800, gloves: 1000, crystalGloves: 1500 };

function toJson(l: Line) {
  const isAccessory = l.style === "gloves" || l.style === "cover";
  return {
    style_id: ids[l.style],
    size: l.size ?? "M",
    start: "2026-12-10",
    end: "2026-12-11",
    daily_price_cents: 0,
    rental_cents: isAccessory ? 1800 : PRICES[1],
    deposit_cents: 0,
    addon_style_ids: (l.addOns ?? []).map((a) => ids[a.style]),
    addon_cents: (l.addOns ?? []).map((a) => a.cents ?? ADDON_CENTS[a.style]),
    addon_sizes: (l.addOns ?? []).map((a) => (a.size === undefined ? null : a.size)),
  };
}

function order(lines: Line[]) {
  return withRole(db, "service_role", () =>
    db.query<{ booking_id: string; booking_no: string }>(
      `select * from public.create_order($1::jsonb, '顾客', 'a@b.co', '5551234567', 'pickup', null, '', 0)`,
      [JSON.stringify(lines.map(toJson))],
    ),
  );
}

async function rowsOf(bookingNo: string) {
  return (
    await db.query<{ booking_no: string; style_id: string; size: string; rental_cents: number }>(
      "select booking_no, style_id, size, rental_cents from public.bookings where booking_no = $1 or booking_no like $1 || '-%' order by booking_no",
      [bookingNo],
    )
  ).rows;
}

async function availability(lines: Line[]) {
  const res = await withRole(db, "anon", () =>
    db.query<{ line: number; fulfillment_method: string; item_ok: boolean; addons_ok: boolean }>(
      "select * from public.cart_availability($1::jsonb) where fulfillment_method = 'pickup' order by line",
      [JSON.stringify(lines.map(toJson))],
    ),
  );
  return res.rows.map((r) => `${r.item_ok ? "ok" : "no"}/${r.addons_ok ? "ok" : "no"}`);
}

beforeAll(async () => {
  db = await createTestDb();
  await style("suit", "suit");
  await style("jacket", "jacket");
  await style("pants", "pants");
  await style("cover", "helmet_cover", { addon: 800 });
  await style("cover2", "helmet_cover", { addon: 800 });
  await style("gloves", "gloves", { addon: 1000 });
  await style("crystalGloves", "gloves", { addon: 1500, tags: ["crystal"] });
  await style("plainGloves", "gloves");
});

beforeEach(async () => {
  await db.query("delete from public.bookings where parent_booking_id is not null");
  await db.query("delete from public.bookings");
  await db.query("delete from public.inventory_items");
  await item("suit", "S-1", "M");
  await item("suit", "S-2", "M");
  await item("jacket", "J-1", "M");
  await item("pants", "P-1", "M");
  await item("cover", "C-1", "均码");
  await item("cover", "C-2", "均码");
  await item("cover2", "C2-1", "均码");
  await item("gloves", "G-1", "玫红 · S");
  await item("gloves", "G-2", "紫色 · M");
  await item("crystalGloves", "X-1", "芭蕾粉 · S");
  await item("plainGloves", "N-1", "L");
});

afterAll(async () => {
  await db?.close();
});

describe("手套加购", () => {
  it("一套衣服加购一顶头盔套和一副手套：手套按选的颜色尺码分配，整个租期一口价", async () => {
    const result = await order([
      { style: "suit", addOns: [{ style: "cover" }, { style: "gloves", size: "紫色 · M" }] },
    ]);
    const rows = await rowsOf(result.rows[0].booking_no);
    expect(rows.map((r) => [r.style_id, r.size, r.rental_cents])).toEqual([
      [ids.suit, "M", 7900],
      [ids.cover, "均码", 800],
      [ids.gloves, "紫色 · M", 1000],
    ]);
  });

  it("水晶手套加购价 $15；价格不对时拒绝", async () => {
    await expect(order([{ style: "suit", addOns: [{ style: "crystalGloves", size: "芭蕾粉 · S" }] }])).resolves.toBeTruthy();
    await expect(
      order([{ style: "suit", addOns: [{ style: "crystalGloves", size: "芭蕾粉 · S", cents: 1000 }] }]),
    ).rejects.toThrow(/price_changed/);
  });

  it("手套没选尺码、尺码没货、没有加购价：拒绝", async () => {
    await expect(order([{ style: "suit", addOns: [{ style: "gloves" }] }])).rejects.toThrow(/invalid_addons/);
    await expect(order([{ style: "suit", addOns: [{ style: "gloves", size: "蓝色 · L" }] }])).rejects.toThrow(
      /addon_unavailable/,
    );
    await expect(order([{ style: "suit", addOns: [{ style: "plainGloves", size: "L", cents: 0 }] }])).rejects.toThrow(
      /addon_not_found/,
    );
  });

  it("一件最多一顶头盔套、一副手套；配件本身不能再加购", async () => {
    // 两套衣服、两顶头盔套，但都挂在第一套上
    await expect(
      order([{ style: "suit", addOns: [{ style: "cover" }, { style: "cover2" }] }, { style: "suit" }]),
    ).rejects.toThrow(/invalid_addons/);
    await expect(
      order([{ style: "gloves", size: "玫红 · S", addOns: [{ style: "cover" }] }, { style: "suit" }]),
    ).rejects.toThrow(/invalid_addons/);
  });

  it("按“几套衣服”限量：两套可以各加购一份；单租上衣不算一套，配上裤子才算", async () => {
    await expect(
      order([
        { style: "suit", addOns: [{ style: "cover" }, { style: "gloves", size: "玫红 · S" }] },
        { style: "suit", addOns: [{ style: "cover" }, { style: "gloves", size: "紫色 · M" }] },
      ]),
    ).resolves.toBeTruthy();
    await db.query("delete from public.bookings where parent_booking_id is not null");
    await db.query("delete from public.bookings");

    await expect(order([{ style: "jacket", addOns: [{ style: "cover" }] }])).rejects.toThrow(/addon_limit/);
    await expect(
      order([{ style: "jacket", addOns: [{ style: "cover" }, { style: "gloves", size: "玫红 · S" }] }, { style: "pants" }]),
    ).resolves.toBeTruthy();
  });

  it("多出来的配件按单租价另租，不受限制", async () => {
    await expect(
      order([
        { style: "suit", addOns: [{ style: "cover" }] },
        { style: "cover", size: "均码" },
        { style: "gloves", size: "紫色 · M" },
      ]),
    ).resolves.toBeTruthy();
  });

  it("购物车检查：加购的手套按尺码查，和单租的手套共用库存", async () => {
    expect(
      await availability([
        { style: "suit", addOns: [{ style: "gloves", size: "玫红 · S" }] },
        { style: "suit", addOns: [{ style: "gloves", size: "玫红 · S" }] },
        { style: "gloves", size: "紫色 · M" },
        { style: "gloves", size: "紫色 · M" },
      ]),
    ).toEqual(["ok/ok", "ok/no", "ok/ok", "no/ok"]);
  });
});
