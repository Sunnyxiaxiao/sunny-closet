import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, withRole } from "../helpers/test-db";

// 付款尝试、退款记录、扣款尝试、库存加锁、瑕疵说明（迁移 20261102000026）
const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

let db: PGlite;
let suitId: string;
let itemId: string;
let notedId: string;
let notedItemId: string;

async function insertSuit(slug: string) {
  const style = await db.query<{ id: string }>(
    "insert into public.styles (slug, name, daily_price_cents, deposit_cents) values ($1, $1, 4900, 0) returning id",
    [slug],
  );
  const item = await db.query<{ id: string }>(
    "insert into public.inventory_items (style_id, size, code) values ($1, 'M', $2) returning id",
    [style.rows[0].id, `${slug}-M`],
  );
  return { styleId: style.rows[0].id, itemId: item.rows[0].id };
}

function order(styleId: string, start: string, end: string, extra: Record<string, unknown> = {}) {
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  const prices = [4900, 7900, 9400];
  return withRole(db, "service_role", () =>
    db.query<{ booking_id: string; booking_no: string }>(
      `select * from public.create_order($1::jsonb, '顾客', 'a@b.co', '5551234567', 'pickup', null, '', 0)`,
      [
        JSON.stringify([
          {
            style_id: styleId,
            size: "M",
            start,
            end,
            daily_price_cents: 0,
            rental_cents: prices[days - 1],
            deposit_cents: 0,
            addon_style_ids: [],
            addon_cents: [],
            ...extra,
          },
        ]),
      ],
    ),
  );
}

function claim(bookingId: string, replaceKey: string | null = null) {
  return withRole(db, "service_role", () =>
    db.query<{ attempt_key: string; expires_at: string; session_id: string | null; created: boolean }>(
      "select * from public.claim_checkout_attempt($1, $2)",
      [bookingId, replaceKey],
    ),
  ).then((r) => r.rows[0]);
}

function block(start: string, end: string, as: "admin" | "customer" = "admin", item = itemId) {
  return withRole(
    db,
    "authenticated",
    () =>
      db.query<{ add_inventory_block: string }>("select public.add_inventory_block($1, $2, $3, '维修')", [
        item,
        start,
        end,
      ]),
    as === "admin" ? ADMIN : CUSTOMER,
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email) values ($1, 'admin@x.co'), ($2, 'c@x.co')", [ADMIN, CUSTOMER]);
  await db.query("insert into public.admin_users (user_id, email) values ($1, 'admin@x.co')", [ADMIN]);
  ({ styleId: suitId, itemId } = await insertSuit("safety-suit"));
  ({ styleId: notedId, itemId: notedItemId } = await insertSuit("noted-suit"));
  await db.query(
    "update public.inventory_items set condition_note = '左袖口有一点起球', condition_note_en = 'Light pilling on the left cuff', condition_image_urls = $2 where id = $1",
    [notedItemId, ["https://x.supabase.co/storage/v1/object/public/style-images/noted/condition/1.jpg"]],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("付款尝试：一张订单同时只有一个", () => {
  it("第一次领取生成新尝试；再次领取拿到同一个，不会新建", async () => {
    const { booking_id } = (await order(suitId, "2027-02-01", "2027-02-01")).rows[0];
    const first = await claim(booking_id);
    expect(first.created).toBe(true);
    expect(first.session_id).toBeNull();

    const again = await claim(booking_id);
    expect(again).toMatchObject({ attempt_key: first.attempt_key, created: false });
    expect(new Date(again.expires_at).getTime()).toBe(new Date(first.expires_at).getTime());
  });

  it("只有说明“这个尝试已结束”时才换新的，并清掉旧的付款页编号", async () => {
    const { booking_id } = (await order(suitId, "2027-02-05", "2027-02-05")).rows[0];
    const first = await claim(booking_id);
    await db.query("update public.bookings set stripe_checkout_session_id = 'cs_old' where id = $1", [booking_id]);

    // 拿错的编号去换：不换，仍是原来的尝试
    const wrong = await claim(booking_id, "00000000-0000-0000-0000-000000000000");
    expect(wrong).toMatchObject({ attempt_key: first.attempt_key, session_id: "cs_old", created: false });

    const renewed = await claim(booking_id, first.attempt_key);
    expect(renewed.created).toBe(true);
    expect(renewed.attempt_key).not.toBe(first.attempt_key);
    expect(renewed.session_id).toBeNull();
  });

  it("已付款、已取消、当面付款、子订单都不能再开付款页", async () => {
    const paid = (await order(suitId, "2027-02-10", "2027-02-10")).rows[0].booking_id;
    await db.query("update public.bookings set paid_at = now(), paid_cents = 4900 where id = $1", [paid]);
    await expect(claim(paid)).rejects.toThrow(/order_not_payable/);

    const cancelled = (await order(suitId, "2027-02-20", "2027-02-20")).rows[0].booking_id;
    await db.query("update public.bookings set status = 'cancelled' where id = $1", [cancelled]);
    await expect(claim(cancelled)).rejects.toThrow(/order_not_payable/);

    const inPerson = (await order(suitId, "2027-03-01", "2027-03-01")).rows[0].booking_id;
    await db.query("update public.bookings set payment_method = 'in_person' where id = $1", [inPerson]);
    await expect(claim(inPerson)).rejects.toThrow(/order_not_payable/);

    await expect(claim("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/order_not_payable/);
  });

  it("顾客和访客不能直接调用", async () => {
    const { booking_id } = (await order(suitId, "2027-03-10", "2027-03-10")).rows[0];
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        withRole(db, role, () => db.query("select * from public.claim_checkout_attempt($1)", [booking_id]), CUSTOMER),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("退款记录", () => {
  it("只接受 待退款 / 已退款，金额不能为负", async () => {
    const { booking_id } = (await order(suitId, "2027-03-20", "2027-03-20")).rows[0];
    await db.query("update public.bookings set refund_status = 'due', refund_cents = 4900 where id = $1", [booking_id]);
    await expect(db.query("update public.bookings set refund_status = 'maybe' where id = $1", [booking_id])).rejects.toThrow();
    await expect(db.query("update public.bookings set refund_cents = -1 where id = $1", [booking_id])).rejects.toThrow();
  });
});

describe("后台扣款尝试", () => {
  it("一张订单同时只能有一笔“处理中 / 结果未知”的扣款；有结果后可以再扣", async () => {
    const { booking_id } = (await order(suitId, "2027-03-30", "2027-03-30")).rows[0];
    const insert = (status: string) =>
      db.query(
        "insert into public.card_charges (booking_id, amount_cents, reason, status, idempotency_key) values ($1, 2500, '逾期 1 天', $2, gen_random_uuid()) returning id",
        [booking_id, status],
      );
    const first = (await insert("pending")).rows[0] as { id: string };
    await expect(insert("pending")).rejects.toThrow(/card_charges_one_open_idx/);

    await db.query("update public.card_charges set status = 'unknown' where id = $1", [first.id]);
    await expect(insert("pending")).rejects.toThrow(/card_charges_one_open_idx/);

    await db.query("update public.card_charges set status = 'failed' where id = $1", [first.id]);
    await expect(insert("pending")).resolves.toBeTruthy();
  });

  it("状态只能是这五种", async () => {
    const { booking_id } = (await order(suitId, "2027-09-01", "2027-09-01")).rows[0];
    await expect(
      db.query(
        "insert into public.card_charges (booking_id, amount_cents, reason, status) values ($1, 100, 'x', 'maybe')",
        [booking_id],
      ),
    ).rejects.toThrow(/card_charges_status_check/);
  });
});

describe("手动锁定日期（add_inventory_block）", () => {
  it("和已有订单（含取件前后）重叠时不锁，并说出是哪张订单", async () => {
    const { booking_no } = (await order(suitId, "2027-04-10", "2027-04-11")).rows[0];
    // 自取占用 4/9–4/12 再加清洁天数
    await expect(block("2027-04-09", "2027-04-09")).rejects.toThrow(new RegExp(`booking_conflict ${booking_no}`));
    await expect(block("2027-04-20", "2027-04-21")).resolves.toBeTruthy();
  });

  it("锁定后，这段时间的订单下不了", async () => {
    await block("2027-05-10", "2027-05-12");
    await expect(order(suitId, "2027-05-11", "2027-05-11")).rejects.toThrow(/no_availability/);
  });

  it("只有管理员能锁定；不能绕过函数直接写锁定表", async () => {
    await expect(block("2027-06-01", "2027-06-02", "customer")).rejects.toThrow(/not_allowed/);
    await expect(
      withRole(
        db,
        "authenticated",
        () =>
          db.query(
            "insert into public.inventory_blocks (inventory_item_id, start_date, end_date) values ($1, '2027-06-01', '2027-06-02')",
            [itemId],
          ),
        ADMIN,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("日期反了、库存不存在都会被拒绝", async () => {
    await expect(block("2027-06-05", "2027-06-04")).rejects.toThrow(/invalid_dates/);
    await expect(block("2027-06-05", "2027-06-06", "admin", "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /item_not_found/,
    );
  });
});

describe("瑕疵说明：分配实物时一起存档", () => {
  it("顾客确认过：订单里存下这件的说明和照片，以及确认时间", async () => {
    const { booking_id } = (await order(notedId, "2027-07-01", "2027-07-01", { condition_ack: true })).rows[0];
    const row = (
      await db.query<{ condition_snapshot: Record<string, unknown>; condition_acknowledged_at: string | null }>(
        "select condition_snapshot, condition_acknowledged_at from public.bookings where id = $1",
        [booking_id],
      )
    ).rows[0];
    expect(row.condition_snapshot).toEqual({
      code: "noted-suit-M",
      size: "M",
      note: "左袖口有一点起球",
      noteEn: "Light pilling on the left cuff",
      imageUrls: ["https://x.supabase.co/storage/v1/object/public/style-images/noted/condition/1.jpg"],
    });
    expect(row.condition_acknowledged_at).not.toBeNull();
  });

  it("分到有说明的那件、但顾客没确认：整单失败，不留下订单", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from public.bookings")).rows[0].n;
    await expect(order(notedId, "2027-07-10", "2027-07-10")).rejects.toThrow(/condition_not_acknowledged line=1/);
    const after = (await db.query<{ n: number }>("select count(*)::int as n from public.bookings")).rows[0].n;
    expect(after).toBe(before);
  });

  it("没有说明的件：不存档，也不需要确认", async () => {
    const { booking_id } = (await order(suitId, "2027-07-20", "2027-07-20")).rows[0];
    const row = (
      await db.query("select condition_snapshot, condition_acknowledged_at from public.bookings where id = $1", [
        booking_id,
      ])
    ).rows[0];
    expect(row).toEqual({ condition_snapshot: null, condition_acknowledged_at: null });
  });

  it("下单后再改说明，订单里的存档不变", async () => {
    const { booking_id } = (await order(notedId, "2027-08-01", "2027-08-01", { condition_ack: true })).rows[0];
    await db.query("update public.inventory_items set condition_note = '已修好' where id = $1", [notedItemId]);
    const row = (
      await db.query<{ condition_snapshot: { note: string } }>(
        "select condition_snapshot from public.bookings where id = $1",
        [booking_id],
      )
    ).rows[0];
    expect(row.condition_snapshot.note).toBe("左袖口有一点起球");
    await db.query("update public.inventory_items set condition_note = '左袖口有一点起球' where id = $1", [notedItemId]);
  });
});
