import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

const DEPOSIT = 5000;
// 完整套装价目表：1 天 $49、2 天 $79、3 天 $94、4 天 $109、5 天 $119、6 天 $129、7 天 $139
const PRICES = [4900, 7900, 9400, 10900, 11900, 12900, 13900];

let db: PGlite;
let styleId: string;

function rentalCents(start: string, end: string) {
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return PRICES[Math.min(days, PRICES.length) - 1];
}

/** 以服务端身份（service_role）调用 create_booking，与网站实际的调用方式一致 */
function book(
  start: string,
  end: string,
  overrides: { size?: string; rental?: number; fulfillment?: string } = {},
) {
  return withRole(db, "service_role", () =>
    db.query<{ booking_id: string; booking_no: string; inventory_item_id: string }>(
      `select * from public.create_booking(
         $1, $2, $3, $4, '顾客', 'a@b.co', '5551234567', $8, $9, '',
         $5, $6, $7)`,
      [
        styleId,
        overrides.size ?? "M",
        start,
        end,
        0,
        overrides.rental ?? rentalCents(start, end),
        DEPOSIT,
        overrides.fulfillment ?? "pickup",
        overrides.fulfillment === "shipping" ? "1 Main St, Ithaca, NY 14850" : null,
      ],
    ),
  );
}

beforeAll(async () => {
  db = await createTestDb();
  const style = await db.query<{ id: string }>(
    "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ('cb', '测试款', $1, $2) returning id",
    [PRICES[0], DEPOSIT],
  );
  styleId = style.rows[0].id;
  await db.query(
    "insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'CB-M-01')",
    [styleId],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("create_booking 创建预订", () => {
  it("创建一笔待确认订单，并写入价格和缓冲天数", async () => {
    const res = await book("2026-01-10", "2026-01-12");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].booking_no).toMatch(/^SC-[A-HJ-NP-Z2-9]{8}$/);

    const row = await db.query<{
      status: string;
      buffer_days: number;
      lead_days: number;
      tail_days: number;
      rental_days: number;
      total_cents: number;
    }>(
      "select status, buffer_days, lead_days, tail_days, rental_days, total_cents from public.bookings where id = $1",
      [res.rows[0].booking_id],
    );
    // 到店自取：前一晚取件、次日中午前归还，各占 1 天但不收费
    expect(row.rows[0]).toEqual({
      status: "pending",
      buffer_days: 1,
      lead_days: 1,
      tail_days: 1,
      rental_days: 3,
      total_cents: 9400 + DEPOSIT,
    });
  });

  it("同一件已被占用的日期不能再订", async () => {
    await expect(book("2026-01-11", "2026-01-13")).rejects.toThrow(/no_availability/);
  });

  it("取件前一晚、归还日、清洁日都占用库存；之后可以再订", async () => {
    // 10–12 号滑雪：9 号晚取件，13 号中午前归还，14 号清洁 → 占用 9–14 号
    // 下一位要在前一晚取件，所以第一个滑雪日最早 16 号（15 号晚取件）
    await expect(book("2026-01-13", "2026-01-14")).rejects.toThrow(/no_availability/);
    await expect(book("2026-01-15", "2026-01-15")).rejects.toThrow(/no_availability/);
    const res = await book("2026-01-16", "2026-01-17");
    expect(res.rows).toHaveLength(1);
  });

  it("新租期在前：归还日 + 清洁日不能撞上已有订单的取件前一晚", async () => {
    // 已有 16–17 号（15 号晚取件）。4–5 号滑雪 → 占用 3–7 号，没问题；12–13 号 → 占用到 15 号，冲突
    await expect(book("2026-01-12", "2026-01-13")).rejects.toThrow(/no_availability/);
  });

  it("邮寄：提前 3 天寄出、用完寄回预留 4 天，这些天都占用库存", async () => {
    // 3 月 10–11 号滑雪，邮寄 → 7 号寄出，最晚 12 号寄回、15 号前到，16 号清洁 → 占用 7–16 号
    const res = await book("2026-03-10", "2026-03-11", { fulfillment: "shipping" });
    const row = await db.query<{ lead_days: number; tail_days: number; rental_cents: number }>(
      "select lead_days, tail_days, rental_cents from public.bookings where id = $1",
      [res.rows[0].booking_id],
    );
    expect(row.rows[0]).toEqual({ lead_days: 3, tail_days: 4, rental_cents: 7900 });
    await expect(book("2026-03-07", "2026-03-07")).rejects.toThrow(/no_availability/);
    await expect(book("2026-03-17", "2026-03-17")).rejects.toThrow(/no_availability/);
    // 5 号滑雪 → 6 号归还、7 号清洁，撞上 7 号寄出；4 号可以
    await expect(book("2026-03-05", "2026-03-05")).rejects.toThrow(/no_availability/);
    await expect(book("2026-03-04", "2026-03-04")).resolves.toBeTruthy();
    await expect(book("2026-03-18", "2026-03-18")).resolves.toBeTruthy();
  });

  it("被拒绝的订单会释放库存", async () => {
    await db.exec(
      "update public.bookings set status = 'rejected' where start_date = '2026-01-10'",
    );
    const res = await book("2026-01-10", "2026-01-11");
    expect(res.rows).toHaveLength(1);
  });

  it("没有这个尺码时报 no_availability", async () => {
    await expect(book("2026-06-01", "2026-06-02", { size: "XL" })).rejects.toThrow(
      /no_availability/,
    );
  });

  it("价格和数据库不一致时拒绝（防止页面上的旧价格被提交）", async () => {
    await expect(book("2026-09-01", "2026-09-02", { rental: 7900 - 1 })).rejects.toThrow(
      /price_changed/,
    );
  });

  it("按阶梯价校验：6 天是 $129，多收或少收都拒绝", async () => {
    const six = await book("2026-04-01", "2026-04-06");
    const row = await db.query<{ rental_cents: number }>(
      "select rental_cents from public.bookings where id = $1",
      [six.rows[0].booking_id],
    );
    expect(row.rows[0].rental_cents).toBe(12900);
    await expect(book("2026-04-10", "2026-04-15", { rental: 14900 })).rejects.toThrow(/price_changed/);
  });

  it("超过最长租期（7 天）时拒绝", async () => {
    await expect(book("2026-05-01", "2026-05-08")).rejects.toThrow(/rental_too_long/);
  });

  it("邮寄至少 2 天，1 天拒绝；自取 1 天可以", async () => {
    await expect(
      book("2026-08-01", "2026-08-01", { fulfillment: "shipping" }),
    ).rejects.toThrow(/shipping_min_days/);
    const ok = await book("2026-08-01", "2026-08-02", { fulfillment: "shipping" });
    expect(ok.rows).toHaveLength(1);
    const pickup = await book("2026-08-10", "2026-08-10", { fulfillment: "pickup" });
    expect(pickup.rows).toHaveLength(1);
  });

  it("归还日早于取件日时拒绝", async () => {
    await expect(book("2026-06-05", "2026-06-04")).rejects.toThrow(/invalid_dates/);
  });

  it("匿名访客不能调用", async () => {
    await expect(
      withRole(db, "anon", () =>
        db.query(
          "select * from public.create_booking($1, 'M', '2026-07-01', '2026-07-02', 'x', 'x@y.co', '5551234567', 'pickup', null, '', $2, $3, $4)",
          [styleId, 0, 7900, DEPOSIT],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("hit_rate_limit 防刷", () => {
  const call = (limit: number) =>
    withRole(db, "service_role", async () =>
      (
        await db.query<{ ok: boolean }>(
          "select public.hit_rate_limit('test_bucket', 'abc', $1, 600) as ok",
          [limit],
        )
      ).rows[0].ok,
    );

  it("超过次数后返回 false", async () => {
    expect(await call(2)).toBe(true);
    expect(await call(2)).toBe(true);
    expect(await call(2)).toBe(false);
  });
});
