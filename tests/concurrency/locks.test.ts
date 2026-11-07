import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles } from "../helpers/test-db";

/**
 * Concurrency on a real PostgreSQL server (PGlite has a single connection, so it can't show two transactions racing).
 * Run with `npm run test:concurrency`: it starts a throwaway local server and sets PG_TEST_URL. Skipped otherwise.
 */
const URL = process.env.PG_TEST_URL;
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

const clients: Client[] = [];
async function connect(): Promise<Client> {
  const client = new Client({ connectionString: URL });
  await client.connect();
  clients.push(client);
  return client;
}

/** Resolves to "waiting" if the promise hasn't settled after a short while (i.e. it's blocked on a lock) */
async function stillWaiting(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("waiting");
  const winner = await Promise.race([promise.then(() => null, () => null), sleep(400).then(() => marker)]);
  return winner === marker;
}
/** Dates a week apart, so test orders never overlap (pickup padding and cleaning days included) */
const week = (base: string, n: number) => new Date(Date.parse(base) + n * 7 * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Settles a promise into ok / the error message, so a rejection can be inspected after the fact */
function settle(promise: Promise<unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  return promise.then(
    () => ({ ok: true as const }),
    (error: Error) => ({ ok: false as const, error: error.message }),
  );
}

async function as(client: Client, role: "service_role" | "authenticated", userId = "") {
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query(`set role ${role}`);
}

let setup: Client;
let styleA: string;
let styleB: string;
let itemA: string;

function line(styleId: string, start: string, end = start) {
  return { style_id: styleId, size: "M", start, end, daily_price_cents: 0, rental_cents: 4900, deposit_cents: 0 };
}

function createOrder(client: Client, lines: object[]) {
  return client.query("select * from public.create_order($1::jsonb, '顾客', 'a@b.co', '5551234567', 'pickup', null, '', 0)", [
    JSON.stringify(lines),
  ]);
}

describe.skipIf(!URL)("真实 PostgreSQL：并发", () => {
  beforeAll(async () => {
    setup = await connect();
    await setup.query("drop schema if exists public cascade; create schema public; grant all on schema public to public");
    await setup.query("drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists extensions cascade");
    for (const role of ["anon", "authenticated", "service_role"]) {
      await setup.query(`drop owned by ${role} cascade`).catch(() => undefined);
      await setup.query(`drop role if exists ${role}`);
    }
    await setup.query(readFileSync(join(__dirname, "..", "db", "supabase-shim.sql"), "utf8"));
    for (const file of migrationFiles()) await setup.query(readFileSync(file, "utf8"));

    await setup.query("insert into auth.users (id, email) values ($1, 'admin@x.co')", [ADMIN]);
    await setup.query("insert into public.admin_users (user_id, email) values ($1, 'admin@x.co')", [ADMIN]);
    const insert = async (slug: string) => {
      const style = await setup.query<{ id: string }>(
        "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ($1, $1, 4900, 0) returning id",
        [slug],
      );
      const item = await setup.query<{ id: string }>(
        "insert into public.inventory_items (style_id, size, code) values ($1, 'M', $2) returning id",
        [style.rows[0].id, `${slug}-M`],
      );
      return { styleId: style.rows[0].id, itemId: item.rows[0].id };
    };
    ({ styleId: styleA, itemId: itemA } = await insert("race-a"));
    ({ styleId: styleB } = await insert("race-b"));
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.end().catch(() => undefined)));
  });

  it("后台先锁定（未提交），同一件的订单要等；锁定提交后订单失败", async () => {
    const admin = await connect();
    const shop = await connect();
    await as(admin, "authenticated", ADMIN);
    await as(shop, "service_role");

    await admin.query("begin");
    await admin.query("select public.add_inventory_block($1, '2027-01-10', '2027-01-12', '维修')", [itemA]);
    const placing = settle(createOrder(shop, [line(styleA, "2027-01-11")]));
    expect(await stillWaiting(placing)).toBe(true);

    await admin.query("commit");
    const result = await placing;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/no_availability/);
  });

  it("顾客先下单（未提交），同一件的锁定要等；订单提交后锁定被拒绝并说出订单号", async () => {
    const admin = await connect();
    const shop = await connect();
    await as(admin, "authenticated", ADMIN);
    await as(shop, "service_role");

    await shop.query("begin");
    const placed = await createOrder(shop, [line(styleA, "2027-02-11")]);
    const blocking = settle(admin.query("select public.add_inventory_block($1, '2027-02-10', '2027-02-12', '维修')", [itemA]));
    expect(await stillWaiting(blocking)).toBe(true);

    await shop.query("commit");
    const result = await blocking;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(`booking_conflict ${placed.rows[0].booking_no}`);
  });

  it("两张购物车以相反顺序抢同两件：每轮恰好一张成功，从不死锁", async () => {
    for (let round = 0; round < 15; round += 1) {
      const day = week("2027-03-01", round);
      const [one, two] = [await connect(), await connect()];
      await as(one, "service_role");
      await as(two, "service_role");
      const results = await Promise.all([
        settle(createOrder(one, [line(styleA, day), line(styleB, day)])),
        settle(createOrder(two, [line(styleB, day), line(styleA, day)])),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const failed = results.find((r) => !r.ok);
      expect(failed && !failed.ok && failed.error).toMatch(/no_availability/);
      await Promise.all([one.end(), two.end()]);
      clients.splice(clients.indexOf(one), 1);
      clients.splice(clients.indexOf(two), 1);
    }
  });

  it("同一订单同时领取付款尝试：两边拿到同一个编号，只新建一次", async () => {
    const shop = await connect();
    await as(shop, "service_role");
    for (let round = 0; round < 10; round += 1) {
      const day = week("2027-07-01", round);
      const { booking_id } = (await createOrder(shop, [line(styleA, day)])).rows[0];
      const [one, two] = [await connect(), await connect()];
      await as(one, "service_role");
      await as(two, "service_role");
      const [a, b] = await Promise.all([
        one.query("select * from public.claim_checkout_attempt($1)", [booking_id]),
        two.query("select * from public.claim_checkout_attempt($1)", [booking_id]),
      ]);
      expect(a.rows[0].attempt_key).toBe(b.rows[0].attempt_key);
      expect([a.rows[0].created, b.rows[0].created].filter(Boolean)).toHaveLength(1);
      await Promise.all([one.end(), two.end()]);
      clients.splice(clients.indexOf(one), 1);
      clients.splice(clients.indexOf(two), 1);
    }
  });

  it("同一订单同时发起两笔扣款：只有一笔能记下", async () => {
    const shop = await connect();
    await as(shop, "service_role");
    const { booking_id } = (await createOrder(shop, [line(styleB, "2027-12-01")])).rows[0];
    const [one, two] = [await connect(), await connect()];
    await as(one, "service_role");
    await as(two, "service_role");
    const insert = (c: Client) =>
      settle(
        c.query(
          "insert into public.card_charges (booking_id, amount_cents, reason, status, idempotency_key) values ($1, 2500, '逾期', 'pending', gen_random_uuid())",
          [booking_id],
        ),
      );
    const results = await Promise.all([insert(one), insert(two)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
  it("后台填预计归还日（未提交），同一件的订单要等；提交后落在新占用期里的订单失败", async () => {
    const admin = await connect();
    const shop = await connect();
    await as(admin, "authenticated", ADMIN);
    await as(shop, "service_role");
    const offset = async (days: number) =>
      (await setup.query<{ d: string }>("select (current_date + $1::int)::text as d", [days])).rows[0].d;
    const late = await setup.query<{ id: string }>(
      `insert into public.bookings (booking_no, style_id, inventory_item_id, size, start_date, end_date, buffer_days, status,
         fulfillment_method, customer_name, customer_email, customer_phone, rental_days, daily_price_cents, rental_cents,
         deposit_cents, total_cents)
       values ('SC-LATE', $1, $2, 'M', $3, $4, 1, 'picked_up', 'pickup', '顾客', 'a@b.co', '5551234567', 2, 0, 0, 0, 0)
       returning id`,
      [styleA, itemA, await offset(-10), await offset(-9)],
    );

    await admin.query("begin");
    await admin.query("select public.set_expected_return_date($1, $2)", [late.rows[0].id, await offset(25)]);
    const placing = settle(createOrder(shop, [line(styleA, await offset(20))]));
    expect(await stillWaiting(placing)).toBe(true);

    await admin.query("commit");
    const result = await placing;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/no_availability/);
  });
});
