import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 雪服：完整套装价目表 1 天 $49、2 天 $79、3 天 $94……；头盔套：1 天 $15、2–3 天 $20、4–7 天 $25
const OUTFIT_PRICES = [4900, 7900, 9400, 10900, 11900, 12900, 13900];
const HELMET_PRICES = [1500, 2000, 2000, 2500];
const OUTFIT_DEPOSIT = 20000;

let db: PGlite;
let outfitId: string;
let regularId: string;
let premiumId: string;
let regularItemId: string;

function days(start: string, end: string) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
}

function price(prices: number[], start: string, end: string) {
  return prices[Math.min(days(start, end), prices.length) - 1];
}

interface BookOptions {
  styleId?: string;
  prices?: number[];
  deposit?: number;
  addOns?: { id: string; cents: number }[];
  rental?: number;
}

/** 以服务端身份调用 create_booking，与网站的调用方式一致 */
function book(start: string, end: string, options: BookOptions = {}) {
  const styleId = options.styleId ?? outfitId;
  const isOutfit = styleId === outfitId;
  const prices = options.prices ?? (isOutfit ? OUTFIT_PRICES : HELMET_PRICES);
  return withRole(db, "service_role", () =>
    db.query<{ booking_id: string; booking_no: string; inventory_item_id: string }>(
      `select * from public.create_booking(
         $1, $2, $3, $4, '顾客', 'a@b.co', '5551234567', 'pickup', null, '',
         0, $5, $6, $7::uuid[], $8::integer[])`,
      [
        styleId,
        isOutfit ? "M" : "均码",
        start,
        end,
        options.rental ?? price(prices, start, end),
        options.deposit ?? (isOutfit ? OUTFIT_DEPOSIT : 0),
        (options.addOns ?? []).map((a) => a.id),
        (options.addOns ?? []).map((a) => a.cents),
      ],
    ),
  );
}

async function insertHelmet(slug: string, tier: "regular" | "premium", addon: number) {
  const res = await db.query<{ id: string }>(
    `insert into public.styles
       (slug, name, category, tier, daily_price_cents, deposit_cents, addon_price_cents, rental_prices_cents)
     values ($1, $1, 'helmet_cover', $2, 1500, 0, $3, $4) returning id`,
    [slug, tier, addon, HELMET_PRICES],
  );
  const item = await db.query<{ id: string }>(
    "insert into public.inventory_items (style_id, size, code) values ($1, '均码', $2) returning id",
    [res.rows[0].id, `HC-${slug}`],
  );
  return { styleId: res.rows[0].id, itemId: item.rows[0].id };
}

async function bookingsOf(bookingNo: string) {
  return (
    await db.query<{
      booking_no: string;
      style_id: string;
      parent_booking_id: string | null;
      rental_cents: number;
      deposit_cents: number;
      total_cents: number;
      status: string;
    }>(
      `select booking_no, style_id, parent_booking_id, rental_cents, deposit_cents, total_cents, status
       from public.bookings where booking_no = $1 or booking_no like $1 || '-%' order by booking_no`,
      [bookingNo],
    )
  ).rows;
}

beforeAll(async () => {
  db = await createTestDb();
  const outfit = await db.query<{ id: string }>(
    "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ('outfit', '雪服', 4900, $1) returning id",
    [OUTFIT_DEPOSIT],
  );
  outfitId = outfit.rows[0].id;
  await db.query(
    "insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'O-M-1'), ($1, 'M', 'O-M-2'), ($1, 'M', 'O-M-3')",
    [outfitId],
  );
  const regular = await insertHelmet("bunny", "regular", 800);
  regularId = regular.styleId;
  regularItemId = regular.itemId;
  premiumId = (await insertHelmet("devil", "premium", 1200)).styleId;
});

afterAll(async () => {
  await db?.close();
});

describe("头盔套计价", () => {
  it("款式自己的价目表：1 天 $15、2–3 天 $20、4–7 天 $25（不按天数相乘）", async () => {
    const res = await db.query<{ d: number; cents: number }>(
      "select d, public.style_rental_price_cents($1, d) as cents from generate_series(1, 7) d",
      [regularId],
    );
    expect(res.rows.map((r) => r.cents)).toEqual([1500, 2000, 2000, 2500, 2500, 2500, 2500]);
  });

  it("雪服没有自己的价目表时用全店价目表", async () => {
    const res = await db.query<{ cents: number }>("select public.style_rental_price_cents($1, 3) as cents", [
      outfitId,
    ]);
    expect(res.rows[0].cents).toBe(9400);
  });

  it("头盔套必须填档位、加购价和价目表", async () => {
    await expect(
      db.query(
        "insert into public.styles (slug, name, category, daily_price_cents, deposit_cents) values ('x', 'x', 'helmet_cover', 0, 0)",
      ),
    ).rejects.toThrow(/styles_helmet_cover_fields/);
  });
});

describe("单租头盔套", () => {
  it("租 3 天收 $20，没有押金", async () => {
    const res = await book("2026-02-02", "2026-02-04", { styleId: regularId });
    const [row] = await bookingsOf(res.rows[0].booking_no);
    expect(row).toMatchObject({ rental_cents: 2000, deposit_cents: 0, total_cents: 2000, parent_booking_id: null });
  });

  it("价格对不上时拒绝（例如按 3 × $15 计算）", async () => {
    await expect(book("2026-02-10", "2026-02-12", { styleId: regularId, rental: 4500 })).rejects.toThrow(
      /price_changed/,
    );
  });

  it("日期重叠（含取件前一晚、归还日、清洁日）时拒绝；之后可以再订", async () => {
    // 已有 2/2–2/4 的订单（到店自取）→ 2/1 晚取件、2/5 归还、2/6 清洁，占用 2/1–2/6
    await expect(book("2026-02-07", "2026-02-07", { styleId: regularId })).rejects.toThrow(/no_availability/);
    await expect(book("2026-01-30", "2026-01-31", { styleId: regularId })).rejects.toThrow(/no_availability/);
    await expect(book("2026-02-08", "2026-02-08", { styleId: regularId })).resolves.toBeTruthy();
  });
});

describe("搭配雪服加购", () => {
  it("3 天雪服 $94 + 经典款头盔套 $8 = $102（再加押金）", async () => {
    const res = await book("2026-03-01", "2026-03-03", { addOns: [{ id: regularId, cents: 800 }] });
    const rows = await bookingsOf(res.rows[0].booking_no);
    expect(rows).toHaveLength(2);
    const [outfit, addOn] = rows;
    expect(outfit).toMatchObject({ style_id: outfitId, rental_cents: 9400, deposit_cents: OUTFIT_DEPOSIT });
    expect(addOn).toMatchObject({
      booking_no: `${res.rows[0].booking_no}-1`,
      style_id: regularId,
      rental_cents: 800,
      deposit_cents: 0,
      total_cents: 800,
    });
    expect(outfit.rental_cents + addOn.rental_cents).toBe(10200);
  });

  it("加购价固定，不随天数变化：7 天高级款仍是 +$12", async () => {
    const res = await book("2026-03-10", "2026-03-16", { addOns: [{ id: premiumId, cents: 1200 }] });
    const rows = await bookingsOf(res.rows[0].booking_no);
    expect(rows.map((r) => r.rental_cents)).toEqual([13900, 1200]);
  });

  it("加购价对不上时拒绝", async () => {
    await expect(book("2026-04-01", "2026-04-02", { addOns: [{ id: premiumId, cents: 800 }] })).rejects.toThrow(
      /price_changed/,
    );
  });

  it("加购的头盔套和单租订单日期重叠：整单拒绝，雪服也不会被占用", async () => {
    // 3/1–3/3 这顶经典款已被上面的加购占用（到 3/4）
    const before = await db.query<{ n: number }>("select count(*)::int as n from public.bookings");
    await expect(book("2026-03-04", "2026-03-05", { addOns: [{ id: regularId, cents: 800 }] })).rejects.toThrow(
      /addon_unavailable/,
    );
    await expect(book("2026-03-02", "2026-03-02", { styleId: regularId })).rejects.toThrow(/no_availability/);
    const after = await db.query<{ n: number }>("select count(*)::int as n from public.bookings");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("头盔套不能再加购头盔套", async () => {
    await expect(
      book("2026-05-01", "2026-05-01", { styleId: regularId, addOns: [{ id: premiumId, cents: 1200 }] }),
    ).rejects.toThrow(/invalid_addons/);
  });

  it("主订单改状态时，加购子订单跟着改", async () => {
    const res = await book("2026-06-01", "2026-06-02", { addOns: [{ id: regularId, cents: 800 }] });
    await db.query("update public.bookings set status = 'confirmed' where id = $1", [res.rows[0].booking_id]);
    expect((await bookingsOf(res.rows[0].booking_no)).map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [res.rows[0].booking_id]);
    expect((await bookingsOf(res.rows[0].booking_no)).map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
    // 取消后头盔套释放，可以再订
    await expect(book("2026-06-01", "2026-06-02", { styleId: regularId })).resolves.toBeTruthy();
  });
});

describe("手动锁定日期", () => {
  it("锁定期间不可预订，可用性查询也显示 0", async () => {
    await db.query(
      "insert into public.inventory_blocks (inventory_item_id, start_date, end_date, reason) values ($1, '2026-07-10', '2026-07-12', '拍照')",
      [regularItemId],
    );
    // 7/13 滑雪要 7/12 晚取件，撞上锁定
    await expect(book("2026-07-13", "2026-07-13", { styleId: regularId })).rejects.toThrow(/no_availability/);

    const availability = await withRole(db, "anon", () =>
      db.query<{ available_count: number }>(
        "select available_count from public.get_availability('2026-07-11', '2026-07-11', $1)",
        [regularId],
      ),
    );
    expect(availability.rows[0].available_count).toBe(0);
    await expect(book("2026-07-14", "2026-07-14", { styleId: regularId })).resolves.toBeTruthy();
  });

  it("访客和普通登录用户看不到锁定记录", async () => {
    await expect(
      withRole(db, "anon", () => db.query("select * from public.inventory_blocks")),
    ).rejects.toThrow(/permission denied/);
    const rows = await withRole(
      db,
      "authenticated",
      () => db.query("select * from public.inventory_blocks"),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(rows.rows).toHaveLength(0);
  });
});
