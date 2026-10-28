import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 完整套装价目表：1 天 $49、2 天 $79、3 天 $94……；头盔套加购 $8
const PRICES = [4900, 7900, 9400, 10900, 11900, 12900, 13900];
const DEPOSIT = 20000;
const HELMET_ADDON = 800;

let db: PGlite;
let suitA: string;
let suitB: string;
let helmetId: string;

function rental(start: string, end: string) {
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return PRICES[Math.min(days, PRICES.length) - 1];
}

interface Line {
  styleId: string;
  start: string;
  end: string;
  size?: string;
  rental?: number;
  addOns?: { id: string; cents: number }[];
}

function line(l: Line) {
  return {
    style_id: l.styleId,
    size: l.size ?? "M",
    start: l.start,
    end: l.end,
    daily_price_cents: 0,
    rental_cents: l.rental ?? rental(l.start, l.end),
    deposit_cents: DEPOSIT,
    addon_style_ids: (l.addOns ?? []).map((a) => a.id),
    addon_cents: (l.addOns ?? []).map((a) => a.cents),
  };
}

/** 以服务端身份调用 create_order，与网站的调用方式一致 */
function order(lines: Line[], options: { fulfillment?: "pickup" | "shipping"; shippingCents?: number } = {}) {
  const shipping = options.fulfillment === "shipping";
  return withRole(db, "service_role", () =>
    db.query<{ booking_id: string; booking_no: string }>(
      `select * from public.create_order($1::jsonb, '顾客', 'a@b.co', '5551234567', $2, $3, '', $4)`,
      [
        JSON.stringify(lines.map(line)),
        options.fulfillment ?? "pickup",
        shipping ? "1 Main St, Ithaca, NY 14850" : null,
        options.shippingCents ?? 0,
      ],
    ),
  );
}

async function rows(bookingNo: string) {
  return (
    await db.query<{
      booking_no: string;
      style_id: string;
      parent_booking_id: string | null;
      cart_item: boolean;
      rental_cents: number;
      deposit_cents: number;
      shipping_cents: number;
      total_cents: number;
      shipping_address: string | null;
      status: string;
    }>(
      `select booking_no, style_id, parent_booking_id, cart_item, rental_cents, deposit_cents,
              shipping_cents, total_cents, shipping_address, status
       from public.bookings where booking_no = $1 or booking_no like $1 || '-%' order by booking_no`,
      [bookingNo],
    )
  ).rows;
}

async function insertSuit(slug: string) {
  const res = await db.query<{ id: string }>(
    "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ($1, $1, $2, $3) returning id",
    [slug, PRICES[0], DEPOSIT],
  );
  await db.query("insert into public.inventory_items (style_id, size, code) values ($1, 'M', $2)", [
    res.rows[0].id,
    `${slug}-M`,
  ]);
  return res.rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb();
  suitA = await insertSuit("suit-a");
  suitB = await insertSuit("suit-b");
  const helmet = await db.query<{ id: string }>(
    `insert into public.styles
       (slug, name, category, tier, daily_price_cents, deposit_cents, addon_price_cents, rental_prices_cents)
     values ('cart-helmet', '头盔套', 'helmet_cover', 'regular', 1500, 0, $1, array[1500, 2000])
     returning id`,
    [HELMET_ADDON],
  );
  helmetId = helmet.rows[0].id;
  await db.query("insert into public.inventory_items (style_id, size, code) values ($1, '均码', 'HC-CART')", [
    helmetId,
  ]);
});

afterAll(async () => {
  await db?.close();
});

describe("create_order 购物车下单", () => {
  it("两件 + 一顶加购头盔套：一个编号，第 2 件和头盔套都是主订单的子订单", async () => {
    const res = await order(
      [
        { styleId: suitA, start: "2027-01-09", end: "2027-01-10" },
        { styleId: suitB, start: "2027-01-09", end: "2027-01-10", addOns: [{ id: helmetId, cents: HELMET_ADDON }] },
      ],
      { fulfillment: "shipping" },
    );
    const no = res.rows[0].booking_no;
    expect(no).toMatch(/^SC-[A-HJ-NP-Z2-9]{8}$/);

    const all = await rows(no);
    expect(all.map((r) => r.booking_no)).toEqual([no, `${no}-1`, `${no}-2`]);
    const [main, second, helmet] = all;
    const address = "1 Main St, Ithaca, NY 14850";
    expect(main).toMatchObject({ style_id: suitA, parent_booking_id: null, cart_item: false, shipping_address: address });
    expect(second).toMatchObject({
      style_id: suitB,
      parent_booking_id: res.rows[0].booking_id,
      cart_item: true,
      rental_cents: 7900,
      deposit_cents: DEPOSIT,
      total_cents: 7900 + DEPOSIT,
      shipping_address: address,
    });
    expect(helmet).toMatchObject({
      style_id: helmetId,
      parent_booking_id: res.rows[0].booking_id,
      cart_item: false,
      total_cents: HELMET_ADDON,
    });
    // 整单合计 = 两件租金 + 两份押金 + 头盔套（这单包邮，没有运费）
    expect(all.reduce((sum, r) => sum + r.total_cents, 0)).toBe(7900 * 2 + DEPOSIT * 2 + HELMET_ADDON);
    expect(all.map((r) => r.shipping_cents)).toEqual([0, 0, 0]);
  });

  it("运费只记在主订单上，并算进合计", async () => {
    const res = await order([{ styleId: suitA, start: "2027-02-06", end: "2027-02-07" }], {
      fulfillment: "shipping",
      shippingCents: 2500,
    });
    const [main] = await rows(res.rows[0].booking_no);
    expect(main).toMatchObject({ shipping_cents: 2500, total_cents: 7900 + DEPOSIT + 2500 });
  });

  it("到店自取不能收运费，运费也不能是负数", async () => {
    await expect(
      order([{ styleId: suitA, start: "2027-02-13", end: "2027-02-13" }], { shippingCents: 1500 }),
    ).rejects.toThrow(/invalid_cart/);
    await expect(
      order([{ styleId: suitA, start: "2027-02-13", end: "2027-02-14" }], { fulfillment: "shipping", shippingCents: -1 }),
    ).rejects.toThrow(/invalid_cart/);
  });

  it("到店自取可以每件日期不同", async () => {
    const res = await order([
      { styleId: suitA, start: "2027-03-01", end: "2027-03-01" },
      { styleId: suitB, start: "2027-03-10", end: "2027-03-12" },
    ]);
    const all = await rows(res.rows[0].booking_no);
    expect(all.map((r) => r.rental_cents)).toEqual([4900, 9400]);
  });

  it("主订单改状态，购物车里的其他件跟着改", async () => {
    const res = await order([
      { styleId: suitA, start: "2027-04-01", end: "2027-04-01" },
      { styleId: suitB, start: "2027-04-01", end: "2027-04-01" },
    ]);
    await db.query("update public.bookings set status = 'confirmed' where id = $1", [res.rows[0].booking_id]);
    expect((await rows(res.rows[0].booking_no)).map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
  });

  it("邮寄的订单每件滑雪日必须相同", async () => {
    await expect(
      order(
        [
          { styleId: suitA, start: "2027-05-01", end: "2027-05-02" },
          { styleId: suitB, start: "2027-05-01", end: "2027-05-03" },
        ],
        { fulfillment: "shipping" },
      ),
    ).rejects.toThrow(/shipping_dates_differ/);
  });

  it("任何一件失败整单回滚，报错带上是第几件", async () => {
    await expect(
      order([
        { styleId: suitA, start: "2027-06-01", end: "2027-06-02" },
        { styleId: suitA, start: "2027-06-01", end: "2027-06-02" },
      ]),
    ).rejects.toThrow(/no_availability line=2/);
    const left = await db.query("select 1 from public.bookings where start_date = '2027-06-01'");
    expect(left.rows).toHaveLength(0);

    await expect(
      order([
        { styleId: suitA, start: "2027-06-10", end: "2027-06-11" },
        { styleId: suitB, start: "2027-06-10", end: "2027-06-11", rental: 1 },
      ]),
    ).rejects.toThrow(/price_changed line=2/);
  });

  it("邮寄每件都要满最短租期", async () => {
    await expect(
      order([{ styleId: suitA, start: "2027-07-01", end: "2027-07-01" }], { fulfillment: "shipping" }),
    ).rejects.toThrow(/shipping_min_days line=1/);
  });

  it("购物车不能是空的或超过 10 件", async () => {
    await expect(order([])).rejects.toThrow(/invalid_cart/);
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      styleId: suitA,
      start: `2027-09-${String(i + 1).padStart(2, "0")}`,
      end: `2027-09-${String(i + 1).padStart(2, "0")}`,
    }));
    await expect(order(eleven)).rejects.toThrow(/invalid_cart/);
  });

  it("格式不对的件会被拒绝", async () => {
    await expect(
      withRole(db, "service_role", () =>
        db.query(
          `select * from public.create_order($1::jsonb, '顾客', 'a@b.co', '5551234567', 'pickup', null, '')`,
          [JSON.stringify([{ style_id: "not-a-uuid", size: "M", start: "2027-10-01", end: "2027-10-01" }])],
        ),
      ),
    ).rejects.toThrow(/invalid_cart line=1/);
  });

  it("匿名访客和登录用户都不能直接调用", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        withRole(db, role, () =>
          db.query(
            `select * from public.create_order('[]'::jsonb, 'x', 'x@y.co', '5551234567', 'pickup', null, '')`,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});
