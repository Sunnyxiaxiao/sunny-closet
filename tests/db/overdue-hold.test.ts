import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 逾期未还继续占用（迁移 20261103000027）。日期都相对“今天”（数据库的 current_date）
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

let db: PGlite;
let styleId: string;
let itemId: string;
let today: Date;
let n = 0;

const day = (offset: number) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** Inserts an order on the piece directly (dates relative to today), cleaning 1 day, no lead / tail days */
async function booking(start: number, end: number, status: string, parent: string | null = null, item = itemId) {
  n += 1;
  const rows = await db.query<{ id: string; booking_no: string }>(
    `insert into public.bookings (booking_no, parent_booking_id, style_id, inventory_item_id, size, start_date, end_date,
       buffer_days, status, fulfillment_method, customer_name, customer_email, customer_phone,
       rental_days, daily_price_cents, rental_cents, deposit_cents, total_cents)
     values ($1, $2, $3, $4, 'M', $5, $6, 1, $7, 'pickup', '顾客', 'a@b.co', '5551234567', $8, 0, 0, 0, 0)
     returning id, booking_no`,
    [`SC-OD${n}`, parent, styleId, item, day(start), day(end), status, end - start + 1],
  );
  return rows.rows[0];
}

async function free(start: number, end: number, item = itemId) {
  const r = await db.query<{ free: boolean }>("select public.is_item_free($1, daterange($2::date, $3::date, '[)')) as free", [
    item,
    day(start),
    day(end + 1),
  ]);
  return r.rows[0].free;
}

function setReturn(bookingId: string, date: number | null, confirm = false, as = ADMIN) {
  return withRole(
    db,
    "authenticated",
    () =>
      db.query("select public.set_expected_return_date($1, $2, $3)", [bookingId, date === null ? null : day(date), confirm]),
    as,
  );
}

function conflicts(as: "admin" | "service_role" = "admin") {
  return withRole(
    db,
    as === "admin" ? "authenticated" : "service_role",
    () =>
      db.query<{ late_booking_no: string; booking_no: string; hold_until: string }>(
        "select late_booking_no, booking_no, hold_until::text from public.overdue_conflicts()",
      ),
    as === "admin" ? ADMIN : undefined,
  ).then((r) => r.rows);
}

beforeAll(async () => {
  db = await createTestDb();
  today = new Date(`${(await db.query<{ d: string }>("select current_date::text as d")).rows[0].d}T00:00:00Z`);
  await db.query("insert into auth.users (id, email) values ($1, 'admin@x.co'), ($2, 'c@x.co')", [ADMIN, CUSTOMER]);
  await db.query("insert into public.admin_users (user_id, email) values ($1, 'admin@x.co')", [ADMIN]);
  styleId = (
    await db.query<{ id: string }>(
      "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ('late-suit', 'late', 4900, 0) returning id",
    )
  ).rows[0].id;
});

beforeEach(async () => {
  await db.query("delete from public.bookings where parent_booking_id is not null");
  await db.query("delete from public.bookings");
  await db.query("delete from public.inventory_items");
  await db.query("update public.settings set overdue_hold_days = 7");
  itemId = (
    await db.query<{ id: string }>(
      "insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'LATE-M') returning id",
      [styleId],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db?.close();
});

describe("逾期未还：继续占用", () => {
  it("还在租期内：只占原来的日期", async () => {
    await booking(-2, 1, "picked_up");
    expect(await free(2, 3)).toBe(false); // 归还日 + 清洁
    expect(await free(4, 5)).toBe(true);
  });

  it("逾期第 1 天、第 8 天、第 30 天：都占到“今天 + 7 天”，之后才空", async () => {
    for (const late of [1, 8, 30]) {
      await db.query("delete from public.bookings");
      // 最后一天是 late+1 天前，应在次日（late 天前）归还，今天已逾期 late 天
      await booking(-late - 3, -late - 1, "picked_up");
      expect(await free(0, 0)).toBe(false);
      expect(await free(7, 7)).toBe(false);
      expect(await free(8, 9)).toBe(true);
    }
  });

  it("归还当天还没点“已归还”：不算逾期（按原来的日期）", async () => {
    await booking(-3, -1, "picked_up");
    expect(await free(2, 3)).toBe(true);
  });

  it("点了“已归还”就释放（只剩清洁日）", async () => {
    const late = await booking(-10, -5, "picked_up");
    expect(await free(3, 3)).toBe(false);
    await db.query("update public.bookings set status = 'returned' where id = $1", [late.id]);
    expect(await free(0, 2)).toBe(true);
  });

  it("后台改占用天数：立即生效", async () => {
    await booking(-10, -5, "picked_up");
    await db.query("update public.settings set overdue_hold_days = 3");
    expect(await free(3, 3)).toBe(false);
    expect(await free(4, 5)).toBe(true);
  });

  it("手动锁定日期也把逾期占用算作冲突", async () => {
    const late = await booking(-10, -5, "picked_up");
    await expect(
      withRole(db, "authenticated", () => db.query("select public.add_inventory_block($1, $2, $3, '维修')", [itemId, day(5), day(6)]), ADMIN),
    ).rejects.toThrow(new RegExp(`booking_conflict ${late.booking_no}`));
  });
});

describe("预计归还日", () => {
  it("填了预计归还日：占到那天 + 清洁日，不再按 7 天顺延", async () => {
    const late = await booking(-10, -5, "picked_up");
    await setReturn(late.id, 2);
    expect(await free(3, 3)).toBe(false); // 清洁日
    expect(await free(4, 5)).toBe(true);
  });

  it("可以往后填得比 7 天更久", async () => {
    const late = await booking(-10, -5, "picked_up");
    await setReturn(late.id, 20);
    expect(await free(15, 15)).toBe(false);
    expect(await free(22, 22)).toBe(true);
  });

  it("预计归还日过了还没还：回到“今天 + 7 天”顺延", async () => {
    const late = await booking(-10, -5, "picked_up");
    await db.query("update public.bookings set expected_return_date = $2 where id = $1", [late.id, day(-1)]);
    expect(await free(7, 7)).toBe(false);
    expect(await free(8, 8)).toBe(true);
  });

  it("清空预计归还日：回到顺延规则", async () => {
    const late = await booking(-10, -5, "picked_up");
    await setReturn(late.id, 20);
    await setReturn(late.id, null);
    expect(await free(9, 9)).toBe(true);
  });

  it("会撞上已有订单：先列出受影响的订单，不保存；确认后才保存，已有订单不被改动", async () => {
    const late = await booking(-10, -5, "picked_up");
    const next = await booking(12, 14, "confirmed");
    await expect(setReturn(late.id, 13)).rejects.toThrow(new RegExp(`return_conflict ${next.booking_no}`));
    const before = await db.query<{ expected_return_date: string | null }>(
      "select expected_return_date::text from public.bookings where id = $1",
      [late.id],
    );
    expect(before.rows[0].expected_return_date).toBeNull();

    await setReturn(late.id, 13, true);
    const after = await db.query<{ late: string; status: string; start_date: string }>(
      "select (select expected_return_date::text from public.bookings where id = $1) as late, status, start_date::text from public.bookings where id = $2",
      [late.id, next.id],
    );
    expect(after.rows[0]).toEqual({ late: day(13), status: "confirmed", start_date: day(12) });
  });

  it("加购的子订单一起改", async () => {
    const late = await booking(-10, -5, "picked_up");
    const otherItem = (
      await db.query<{ id: string }>("insert into public.inventory_items (style_id, size, code) values ($1, 'M', 'LATE-M2') returning id", [
        styleId,
      ])
    ).rows[0].id;
    const child = await booking(-10, -5, "picked_up", late.id, otherItem);
    await setReturn(late.id, 15);
    const r = await db.query<{ d: string }>("select expected_return_date::text as d from public.bookings where id = $1", [child.id]);
    expect(r.rows[0].d).toBe(day(15));
    expect(await free(10, 10, otherItem)).toBe(false);
  });

  it("不能填过去的日期；没取件的订单不能填；非管理员不能调用", async () => {
    const late = await booking(-10, -5, "picked_up");
    await expect(setReturn(late.id, -1)).rejects.toThrow(/invalid_dates/);
    const future = await booking(20, 22, "confirmed");
    await expect(setReturn(future.id, 25)).rejects.toThrow(/not_picked_up/);
    await expect(setReturn(late.id, 3, false, CUSTOMER)).rejects.toThrow(/not_allowed/);
  });
});

describe("逾期撞上已有订单", () => {
  it("后台和定期清理都能看到冲突；已有订单原样保留", async () => {
    const late = await booking(-10, -5, "picked_up");
    const next = await booking(3, 4, "confirmed");
    const later = await booking(20, 21, "confirmed");
    for (const as of ["admin", "service_role"] as const) {
      const rows = await conflicts(as);
      expect(rows).toEqual([expect.objectContaining({ late_booking_no: late.booking_no, booking_no: next.booking_no, hold_until: day(7) })]);
    }
    const kept = await db.query<{ status: string }>("select status from public.bookings where id in ($1, $2)", [next.id, later.id]);
    expect(kept.rows.map((r) => r.status)).toEqual(["confirmed", "confirmed"]);
  });

  it("没有逾期的订单不报冲突", async () => {
    await booking(-2, 1, "picked_up");
    await booking(3, 4, "confirmed");
    expect(await conflicts()).toEqual([]);
  });

  it("顾客看不到别人的冲突", async () => {
    await booking(-10, -5, "picked_up");
    await booking(3, 4, "confirmed");
    const rows = await withRole(db, "authenticated", () => db.query("select * from public.overdue_conflicts()"), CUSTOMER);
    expect(rows.rows).toEqual([]);
  });
});
