import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createTestDb, withRole } from '../helpers/test-db';

let db: PGlite;
let styleId: string;
let itemId: string;
beforeAll(async () => {
  db = await createTestDb();
  styleId = (await db.query<{ id: string }>("insert into public.styles(slug,name,daily_price_cents,deposit_cents) values ('atomic-test','Atomic',4900,0) returning id")).rows[0].id;
  itemId = (await db.query<{ id: string }>("insert into public.inventory_items(style_id,size,code,condition_note,condition_note_en) values ($1,'M','ATOMIC-M','旧说明','Old note') returning id", [styleId])).rows[0].id;
});
afterAll(async () => { await db?.close(); });
let week = 0;
function place(method: string, note: string, role: 'service_role' | 'authenticated' = 'service_role') {
  const start = new Date(Date.UTC(2027, 0, 4 + ++week * 14)).toISOString().slice(0, 10);
  return withRole(db, role, () => db.query<{ booking_id: string }>(
    `select * from public.place_order_checked($1::jsonb,'Customer','a@b.co','5551234567','pickup',null,'',0,0,false,$2,$3,'en')`,
    [JSON.stringify([{style_id:styleId,size:'M',start,end:start,daily_price_cents:4900,rental_cents:4900,deposit_cents:0,addon_style_ids:[],addon_cents:[],addon_sizes:[],condition_ack:true,condition_notes:[{itemId,text:note,imageUrls:[]}]}]), method, method === 'in_person' ? 20000 : 0],
  ));
}
it('records card payment method in the order transaction before Stripe is called', async () => {
  const order = (await place('card','Old note')).rows[0];
  const row = (await db.query('select payment_method,status,cash_deposit_cents from public.bookings where id=$1', [order.booking_id])).rows[0];
  expect(row).toEqual({payment_method:'card',status:'pending',cash_deposit_cents:0});
});
it('confirms cash pickup and its deposit atomically', async () => {
  const order = (await place('in_person','Old note')).rows[0];
  expect((await db.query('select payment_method,status,cash_deposit_cents from public.bookings where id=$1', [order.booking_id])).rows[0]).toEqual({payment_method:'in_person',status:'confirmed',cash_deposit_cents:20000});
});
it('rolls back the entire order when the acknowledged note has changed', async () => {
  await db.query("update public.inventory_items set condition_note_en='New note' where id=$1", [itemId]);
  const before = (await db.query('select count(*) from public.bookings')).rows;
  await expect(place('card','Old note')).rejects.toThrow(/condition_not_acknowledged/);
  expect((await db.query('select count(*) from public.bookings')).rows).toEqual(before);
  await expect(place('card','New note')).resolves.toBeDefined();
});
it('does not expose the service RPC to customers', async () => {
  await expect(place('card','New note','authenticated')).rejects.toThrow(/permission denied/);
});

it('rejects changed photos even when the note text is unchanged', async () => {
  await db.query("update public.inventory_items set condition_image_urls=ARRAY['https://example.com/new.jpg'] where id=$1", [itemId]);
  const before = (await db.query('select count(*) from public.bookings')).rows;
  await expect(place('card','New note')).rejects.toThrow(/condition_not_acknowledged/);
  expect((await db.query('select count(*) from public.bookings')).rows).toEqual(before);
});
