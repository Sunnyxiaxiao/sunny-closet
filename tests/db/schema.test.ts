import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
});

afterAll(async () => {
  await db?.close();
});

describe("迁移与种子数据", () => {
  it("建出全部表并写入演示数据", async () => {
    const styles = await db.query<{ n: number }>("select count(*)::int as n from public.styles");
    const items = await db.query<{ n: number }>("select count(*)::int as n from public.inventory_items");
    const bookings = await db.query<{ n: number }>("select count(*)::int as n from public.bookings");
    expect(styles.rows[0].n).toBe(8);
    expect(items.rows[0].n).toBe(8);
    expect(bookings.rows[0].n).toBe(2);
  });

  it("每套演示雪服都只有一件库存，并带品牌和品类", async () => {
    const res = await db.query<{ slug: string; brand: string; category: string; n: number }>(
      `select s.slug, s.brand, s.category, count(i.id)::int as n
       from public.styles s left join public.inventory_items i on i.style_id = s.id
       group by s.id`,
    );
    for (const row of res.rows) expect(row.n).toBe(1);
    expect(new Set(res.rows.map((r) => r.category))).toEqual(
      new Set(["suit", "one_piece", "jacket", "pants"]),
    );
    expect(res.rows.some((r) => r.brand === "ISEE MIGGA")).toBe(true);
  });

  it("品类只能是 成套/连体服/上衣/裤子", async () => {
    await expect(
      db.query(
        "insert into public.styles (slug, name, category, daily_price_cents, deposit_cents) values ('bad', 'x', 'kids', 0, 0)",
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("种子数据可重复执行而不重复插入", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    await db.exec(readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8"));
    const items = await db.query<{ n: number }>("select count(*)::int as n from public.inventory_items");
    const bookings = await db.query<{ n: number }>("select count(*)::int as n from public.bookings");
    expect(items.rows[0].n).toBe(8);
    expect(bookings.rows[0].n).toBe(2);
  });

  it("缓冲天数默认 1 天", async () => {
    const res = await db.query<{ buffer_days: number }>("select buffer_days from public.settings");
    expect(res.rows[0].buffer_days).toBe(1);
  });

  it("预订编号格式为 SC- 加 8 位", async () => {
    const res = await db.query<{ booking_no: string }>("select booking_no from public.bookings");
    for (const row of res.rows) {
      expect(row.booking_no).toMatch(/^SC-[A-HJ-NP-Z2-9]{8}$/);
    }
  });
});

describe("权限（RLS）", () => {
  it("匿名访客读不到任何订单", async () => {
    await expect(
      withRole(db, "anon", () => db.query("select * from public.bookings")),
    ).rejects.toThrow(/permission denied/);
  });

  it("匿名访客读不到库存件明细和防刷记录", async () => {
    await expect(
      withRole(db, "anon", () => db.query("select * from public.inventory_items")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withRole(db, "anon", () => db.query("select * from public.rate_limits")),
    ).rejects.toThrow(/permission denied/);
  });

  it("匿名访客只能看到上架的款式", async () => {
    await db.exec("update public.styles set is_active = false where slug = 'black-wide-pants'");
    const rows = await withRole(db, "anon", async () =>
      (await db.query<{ slug: string }>("select slug from public.styles")).rows,
    );
    expect(rows.map((r) => r.slug)).not.toContain("black-wide-pants");
    expect(rows).toHaveLength(7);
    await db.exec("update public.styles set is_active = true where slug = 'black-wide-pants'");
  });

  it("匿名访客不能修改款式", async () => {
    await withRole(db, "anon", async () => {
      await expect(
        db.query("update public.styles set daily_price_cents = 1"),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("匿名访客可以查询可用性，但不能直接创建预订", async () => {
    const rows = await withRole(db, "anon", async () =>
      (await db.query("select * from public.get_availability()")).rows,
    );
    expect(rows.length).toBeGreaterThan(0);

    await expect(
      withRole(db, "anon", () =>
        db.query(
          "select * from public.create_booking(gen_random_uuid(), 'M', current_date, current_date, 'a', 'a@b.c', '1', 'pickup', null, '', 0, 0, 0)",
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("已登录但非管理员的用户读不到订单", async () => {
    const user = await db.query<{ id: string }>(
      "insert into auth.users (email) values ('stranger@example.com') returning id",
    );
    const rows = await withRole(
      db,
      "authenticated",
      async () => (await db.query("select * from public.bookings")).rows,
      user.rows[0].id,
    );
    expect(rows).toHaveLength(0);
  });

  it("管理员可以读到全部订单", async () => {
    const user = await db.query<{ id: string }>(
      "insert into auth.users (email) values ('owner@example.com') returning id",
    );
    const adminId = user.rows[0].id;
    await db.query("insert into public.admin_users (user_id, email) values ($1, 'owner@example.com')", [
      adminId,
    ]);
    const rows = await withRole(
      db,
      "authenticated",
      async () => (await db.query("select * from public.bookings")).rows,
      adminId,
    );
    expect(rows).toHaveLength(2);
  });
});
