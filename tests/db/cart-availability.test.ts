import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 购物车整体可租检查 + 邮件发送记录（迁移 20261106000029）
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

let db: PGlite;
const ids: Record<string, string> = {};
const items: Record<string, string> = {};
let today: Date;

const day = (offset: number) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

interface Line {
  style: string;
  size?: string | null;
  start: number;
  end: number;
  addOns?: string[];
}

/** Returns "pickup item/addons, shipping item/addons" per line, e.g. ["ok/ok ok/ok", "no/ok no/ok"] */
async function check(lines: Line[]) {
  const rows = await withRole(db, "anon", () =>
    db.query<{ line: number; fulfillment_method: string; item_ok: boolean; addons_ok: boolean }>(
      "select * from public.cart_availability($1::jsonb)",
      [
        JSON.stringify(
          lines.map((l) => ({
            style_id: ids[l.style] ?? l.style,
            size: l.size === undefined ? "M" : l.size,
            start: day(l.start),
            end: day(l.end),
            addon_style_ids: (l.addOns ?? []).map((a) => ids[a]),
          })),
        ),
      ],
    ),
  );
  const word = (b: boolean) => (b ? "ok" : "no");
  return lines.map((_, i) =>
    ["pickup", "shipping"]
      .map((m) => rows.rows.find((r) => r.line === i + 1 && r.fulfillment_method === m)!)
      .map((r) => `${word(r.item_ok)}/${word(r.addons_ok)}`)
      .join(" "),
  );
}

async function style(slug: string, category: string, bundle: string[] | null = null) {
  const res = await db.query<{ id: string }>(
    `insert into public.styles (slug, name, category, daily_price_cents, deposit_cents, bundle_style_ids, tier, addon_price_cents, rental_prices_cents)
     values ($1, $1, $2, 3500, 0, $3, $4, $5, $6) returning id`,
    category === "helmet_cover" ? [slug, category, bundle, "regular", 1000, [1500]] : [slug, category, bundle, null, null, null],
  );
  ids[slug] = res.rows[0].id;
}

async function item(slug: string, code: string, size = "M") {
  const res = await db.query<{ id: string }>(
    "insert into public.inventory_items (style_id, size, code) values ($1, $2, $3) returning id",
    [ids[slug], size, code],
  );
  items[code] = res.rows[0].id;
}

let n = 0;
/** An existing order on a piece (dates relative to today), cleaning 1 day, no lead / tail days */
async function existing(code: string, start: number, end: number, status = "confirmed") {
  n += 1;
  await db.query(
    `insert into public.bookings (booking_no, style_id, inventory_item_id, size, start_date, end_date,
       buffer_days, status, fulfillment_method, customer_name, customer_email, customer_phone,
       rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents)
     select $1, i.style_id, i.id, i.size, $2, $3, 1, $4, 'pickup', '顾客', 'a@b.co', '5551234567', $5, 0, 0, 0, 0
     from public.inventory_items i where i.id = $6`,
    [`SC-CA${n}`, day(start), day(end), status, end - start + 1, items[code]],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  today = new Date(`${(await db.query<{ d: string }>("select current_date::text as d")).rows[0].d}T00:00:00Z`);
  await db.query("insert into auth.users (id, email) values ($1, 'admin@x.co'), ($2, 'c@x.co')", [ADMIN, CUSTOMER]);
  await db.query("insert into public.admin_users (user_id, email) values ($1, 'admin@x.co')", [ADMIN]);
  await db.query(
    "update public.settings set buffer_days = 1, pickup_lead_days = 0, pickup_tail_days = 0, shipping_lead_days = 3, shipping_tail_days = 3, overdue_hold_days = 7",
  );
  await style("suit", "suit");
  await style("hoodie", "jacket");
  await style("pants", "pants");
  await style("set", "suit", [ids.hoodie, ids.pants]);
  await style("cover", "helmet_cover");
});

beforeEach(async () => {
  await db.query("delete from public.email_log");
  await db.query("delete from public.bookings where parent_booking_id is not null");
  await db.query("delete from public.bookings");
  await db.query("delete from public.inventory_items");
  await item("suit", "S-1");
  await item("hoodie", "H-1");
  await item("pants", "P-1");
  await item("cover", "C-1", "均码");
});

afterAll(async () => {
  await db?.close();
});

describe("购物车整体可租检查", () => {
  it("一件库存、两段日期部分重叠：第二件显示没货（原来按“完全相同的日期”计数会显示两件都有）", async () => {
    expect(await check([{ style: "suit", start: 20, end: 22 }, { style: "suit", start: 22, end: 24 }])).toEqual([
      "ok/ok ok/ok",
      "no/ok no/ok",
    ]);
  });

  it("日期不重叠（含清洁天数）：两件都有", async () => {
    expect(await check([{ style: "suit", start: 20, end: 21 }, { style: "suit", start: 23, end: 24 }])).toEqual([
      "ok/ok ok/ok",
      // 邮寄要多占前后 3 天，同一件来不及
      "ok/ok no/ok",
    ]);
  });

  it("套装和单租的雪裤共用库存：先放套装，后面单租雪裤没货", async () => {
    expect(await check([{ style: "set", start: 20, end: 21 }, { style: "pants", start: 20, end: 21 }])).toEqual([
      "ok/ok ok/ok",
      "no/ok no/ok",
    ]);
  });

  it("套装缺一件：整套没货，已经数进去的卫衣还给后面的商品", async () => {
    await existing("P-1", 19, 22);
    expect(await check([{ style: "set", start: 20, end: 21 }, { style: "hoodie", start: 20, end: 21 }])).toEqual([
      "no/ok no/ok",
      "ok/ok ok/ok",
    ]);
  });

  it("加购的头盔套和单独租的头盔套共用库存", async () => {
    expect(
      await check([
        { style: "suit", start: 20, end: 21, addOns: ["cover"] },
        { style: "cover", size: null, start: 20, end: 21 },
      ]),
    ).toEqual(["ok/ok ok/ok", "no/ok no/ok"]);
  });

  it("加购的头盔套没货：雪服本身仍显示有货，只标出加购没货", async () => {
    await existing("C-1", 20, 21);
    expect(await check([{ style: "suit", start: 20, end: 21, addOns: ["cover"] }])).toEqual(["ok/no ok/no"]);
  });

  it("邮寄的前后占用天数：到店自取有货、邮寄没货", async () => {
    await existing("S-1", 24, 25);
    expect(await check([{ style: "suit", start: 20, end: 21 }])).toEqual(["ok/ok no/ok"]);
  });

  it("逾期未还的件继续占用", async () => {
    await existing("S-1", -10, -5, "picked_up");
    expect(await check([{ style: "suit", start: 3, end: 4 }])).toEqual(["no/ok no/ok"]);
    expect(await check([{ style: "suit", start: 20, end: 21 }])).toEqual(["ok/ok ok/ok"]);
  });

  it("尺码不对、款式不存在或下架、日期写错：显示没货，不报错", async () => {
    await db.query("update public.styles set is_active = false where id = $1", [ids.hoodie]);
    expect(
      await check([
        { style: "suit", size: "L", start: 20, end: 21 },
        { style: "00000000-0000-0000-0000-000000000000", start: 20, end: 21 },
        { style: "not-a-uuid", start: 20, end: 21 },
        { style: "hoodie", start: 20, end: 21 },
      ]),
    ).toEqual(["no/ok no/ok", "no/ok no/ok", "no/ok no/ok", "no/ok no/ok"]);
    await db.query("update public.styles set is_active = true where id = $1", [ids.hoodie]);
  });

  it("只读：检查后没有写入订单；超过 10 件报错", async () => {
    await check([{ style: "suit", start: 20, end: 21, addOns: ["cover"] }]);
    expect((await db.query("select 1 from public.bookings")).rows).toHaveLength(0);
    const lines = Array.from({ length: 11 }, () => ({ style: "suit", start: 20, end: 21 }));
    await expect(check(lines)).rejects.toThrow(/invalid_cart/);
  });
});

describe("邮件发送记录", () => {
  async function insertLog() {
    await existing("S-1", 20, 21);
    const booking = (await db.query<{ id: string }>("select id from public.bookings limit 1")).rows[0];
    await db.query("insert into public.email_log (booking_id, kind, status) values ($1, 'order_confirmed', 'failed')", [booking.id]);
    return booking.id;
  }

  it("管理员能看；顾客和未登录的人看不到", async () => {
    await insertLog();
    const read = (role: "anon" | "authenticated", user?: string) =>
      withRole(db, role, () => db.query("select kind from public.email_log"), user).then(
        (r) => r.rows,
        () => "denied",
      );
    expect(await read("authenticated", ADMIN)).toHaveLength(1);
    expect(await read("authenticated", CUSTOMER)).toEqual([]);
    expect(await read("anon")).toBe("denied");
  });

  it("只有服务端能写", async () => {
    const bookingId = await insertLog();
    await expect(
      withRole(
        db,
        "authenticated",
        () => db.query("insert into public.email_log (booking_id, kind) values ($1, 'new_order')", [bookingId]),
        ADMIN,
      ),
    ).rejects.toThrow();
    await expect(
      withRole(db, "authenticated", () => db.query("update public.email_log set status = 'sent'"), ADMIN),
    ).rejects.toThrow();
  });
});
