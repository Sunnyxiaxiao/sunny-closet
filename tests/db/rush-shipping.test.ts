import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 邮寄急单：加急费、等店主确认（迁移 20261103000028）
let db: PGlite;
let styleId: string;
let week = 0;

function place(
  fulfillment: "shipping" | "pickup",
  shippingCents: number,
  rushCents: number,
  needsAcceptance: boolean,
  role: "service_role" | "authenticated" = "service_role",
) {
  week += 1;
  const start = new Date(Date.UTC(2027, 0, 4 + week * 14)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(2027, 0, 5 + week * 14)).toISOString().slice(0, 10);
  return withRole(db, role, () =>
    db.query<{ booking_id: string; booking_no: string }>(
      `select * from public.place_order($1::jsonb, '顾客', 'a@b.co', '5551234567', $2, $3, '', $4, $5, $6)`,
      [
        JSON.stringify([
          {
            style_id: styleId,
            size: "M",
            start,
            end,
            daily_price_cents: 0,
            rental_cents: 7900,
            deposit_cents: 0,
            addon_style_ids: [],
            addon_cents: [],
          },
        ]),
        fulfillment,
        fulfillment === "shipping" ? "1 Main St, Ithaca, NY 14850" : null,
        shippingCents,
        rushCents,
        needsAcceptance,
      ],
    ),
  ).then((r) => r.rows[0]);
}

const row = (id: string) =>
  db
    .query<{ rush_fee_cents: number; acceptance_status: string | null; shipping_cents: number; total_cents: number }>(
      "select rush_fee_cents, acceptance_status, shipping_cents, total_cents from public.bookings where id = $1",
      [id],
    )
    .then((r) => r.rows[0]);

beforeAll(async () => {
  db = await createTestDb();
  styleId = (
    await db.query<{ id: string }>(
      "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ('rush-suit', 'rush', 4900, 0) returning id",
    )
  ).rows[0].id;
  await db.query("insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'RUSH-M')", [styleId]);
});

afterAll(async () => {
  await db?.close();
});

describe("邮寄急单下单", () => {
  it("加急：加急费算在运费里，订单总价包含它，不需要店主确认", async () => {
    const order = await place("shipping", 1500, 1500, false);
    expect(await row(order.booking_id)).toEqual({ rush_fee_cents: 1500, acceptance_status: null, shipping_cents: 1500, total_cents: 9400 });
  });

  it("不加急：记为等店主确认", async () => {
    const order = await place("shipping", 0, 0, true);
    expect(await row(order.booking_id)).toMatchObject({ rush_fee_cents: 0, acceptance_status: "awaiting" });
  });

  it("普通订单：两项都为空", async () => {
    const order = await place("shipping", 1500, 0, false);
    expect(await row(order.booking_id)).toMatchObject({ rush_fee_cents: 0, acceptance_status: null });
  });

  it("不合理的组合被拒：自取不能加急或等确认、加急费超过运费、两样都选", async () => {
    await expect(place("pickup", 0, 1500, false)).rejects.toThrow(/invalid_cart/);
    await expect(place("pickup", 0, 0, true)).rejects.toThrow(/invalid_cart/);
    await expect(place("shipping", 1000, 1500, false)).rejects.toThrow(/invalid_cart/);
    await expect(place("shipping", 1500, 1500, true)).rejects.toThrow(/invalid_cart/);
    await expect(place("shipping", 1500, -1, false)).rejects.toThrow(/invalid_cart/);
  });

  it("下单失败时什么都不留下", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from public.bookings")).rows[0].n;
    await expect(place("pickup", 0, 0, true)).rejects.toThrow();
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.bookings")).rows[0].n).toBe(before);
  });

  it("顾客不能直接调用", async () => {
    await expect(place("shipping", 1500, 1500, false, "authenticated")).rejects.toThrow(/permission denied/);
  });
});
