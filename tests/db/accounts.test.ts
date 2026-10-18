import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

const ALICE = "00000000-0000-0000-0000-00000000a11c";
const BOB = "00000000-0000-0000-0000-000000000b0b";
const ADMIN = "00000000-0000-0000-0000-0000000ad111";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email) values ($1, 'a@x.co'), ($2, 'b@x.co'), ($3, 'admin@x.co')", [
    ALICE,
    BOB,
    ADMIN,
  ]);
  await db.query("insert into public.admin_users (user_id, email) values ($1, 'admin@x.co')", [ADMIN]);
  await db.query("insert into public.profiles (user_id, full_name) values ($1, 'Alice'), ($2, 'Bob')", [ALICE, BOB]);
});

afterAll(async () => {
  await db?.close();
});

describe("顾客资料", () => {
  it("只能看到、修改自己的资料", async () => {
    const rows = await withRole(db, "authenticated", () => db.query("select full_name from public.profiles"), ALICE);
    expect(rows.rows).toEqual([{ full_name: "Alice" }]);

    await withRole(
      db,
      "authenticated",
      () => db.query("update public.profiles set phone = '555' where user_id = $1", [BOB]),
      ALICE,
    );
    const bob = await db.query<{ phone: string }>("select phone from public.profiles where user_id = $1", [BOB]);
    expect(bob.rows[0].phone).toBe("");
  });

  it("不能替别人建资料", async () => {
    await expect(
      withRole(
        db,
        "authenticated",
        () => db.query("insert into public.profiles (user_id) values ($1)", [ADMIN]),
        ALICE,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("没登录的访客看不到任何资料", async () => {
    await expect(withRole(db, "anon", () => db.query("select * from public.profiles"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("后台改价格", () => {
  const update = (user: string) =>
    withRole(
      db,
      "authenticated",
      () => db.query("update public.settings set pants_prices_cents = '{2000,3000}' where id"),
      user,
    );

  it("管理员可以改价目表", async () => {
    await update(ADMIN);
    const res = await db.query<{ p: number[] }>("select pants_prices_cents as p from public.settings");
    expect(res.rows[0].p).toEqual([2000, 3000]);
  });

  it("普通顾客改不了（更新 0 行）", async () => {
    await db.query("update public.settings set pants_prices_cents = '{2500}' where id");
    await update(ALICE);
    const res = await db.query<{ p: number[] }>("select pants_prices_cents as p from public.settings");
    expect(res.rows[0].p).toEqual([2500]);
  });

  it("顾客不能直接读订单表", async () => {
    const rows = await withRole(db, "authenticated", () => db.query("select * from public.bookings"), ALICE);
    expect(rows.rows).toEqual([]);
  });
});
