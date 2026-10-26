import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

let db: PGlite;
let bookings: { id: string; style_id: string }[];

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  bookings = (await db.query<{ id: string; style_id: string }>("select id, style_id from public.bookings order by booking_no"))
    .rows;
  // 演示数据里有两笔订单：一条已发布、一条待审核
  for (const [i, status] of (["published", "pending"] as const).entries()) {
    await db.query(
      `insert into public.reviews (booking_id, style_id, rating, body, display_name, status, published_at)
       values ($1, $2, 5, $3, 'Amy', $4, case when $4 = 'published' then now() end)`,
      [bookings[i].id, bookings[i].style_id, `review ${status}`, status],
    );
  }
});

afterAll(async () => {
  await db?.close();
});

async function makeUser(email: string, admin: boolean) {
  const id = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
  if (admin) await db.query("insert into public.admin_users (user_id, email) values ($1, $2)", [id, email]);
  return id;
}

describe("顾客评价", () => {
  it("访客只看到已发布的评价", async () => {
    const rows = await withRole(db, "anon", async () =>
      (await db.query<{ body: string }>("select body from public.reviews")).rows,
    );
    expect(rows.map((r) => r.body)).toEqual(["review published"]);
  });

  it("访客读不到评价对应的订单", async () => {
    await expect(withRole(db, "anon", () => db.query("select booking_id from public.reviews"))).rejects.toThrow();
  });

  it("访客和登录顾客都不能直接写评价（只能通过服务端核对订单后写入）", async () => {
    const sql = `insert into public.reviews (booking_id, style_id, rating, body, display_name) values ($1, $2, 5, 'x', 'x')`;
    await expect(withRole(db, "anon", () => db.query(sql, [bookings[1].id, bookings[1].style_id]))).rejects.toThrow();
    const customer = await makeUser("customer@example.com", false);
    await expect(
      withRole(db, "authenticated", () => db.query(sql, [bookings[1].id, bookings[1].style_id]), customer),
    ).rejects.toThrow();
  });

  it("每笔订单只能有一条评价", async () => {
    await expect(
      db.query(
        "insert into public.reviews (booking_id, style_id, rating, body, display_name) values ($1, $2, 4, 'again', 'Amy')",
        [bookings[0].id, bookings[0].style_id],
      ),
    ).rejects.toThrow();
  });

  it("只有管理员能看到待审核的评价并发布", async () => {
    const customer = await makeUser("customer2@example.com", false);
    const visible = await withRole(db, "authenticated", async () =>
      (await db.query("select id from public.reviews")).rows,
      customer,
    );
    expect(visible).toHaveLength(1);
    const touched = await withRole(db, "authenticated", async () =>
      (await db.query("update public.reviews set status = 'published' where status = 'pending' returning id")).rows,
      customer,
    );
    expect(touched).toHaveLength(0);

    const admin = await makeUser("owner@example.com", true);
    const all = await withRole(db, "authenticated", async () =>
      (await db.query("select id from public.reviews")).rows,
      admin,
    );
    expect(all).toHaveLength(2);
    const published = await withRole(db, "authenticated", async () =>
      (await db.query("update public.reviews set status = 'published', published_at = now() where status = 'pending' returning id")).rows,
      admin,
    );
    expect(published).toHaveLength(1);
  });

  it("评分只能是 1–5 星", async () => {
    await expect(db.query("update public.reviews set rating = 6")).rejects.toThrow();
  });
});
