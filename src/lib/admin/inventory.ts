import "server-only";
import type { requireAdmin } from "@/lib/admin/auth";
import { addDays, type IsoDate } from "@/lib/dates";
import { itemState, upcomingBookings, type ItemBooking, type ItemState } from "@/lib/inventory/status";
import type { BookingRow, InventoryBlockRow, InventoryItemRow } from "@/lib/supabase/database.types";

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type ItemReservation = ItemBooking &
  Pick<BookingRow, "id" | "booking_no" | "customer_name" | "parent_booking_id">;

export interface ItemOverview {
  item: InventoryItemRow;
  state: ItemState;
  upcoming: ItemReservation[];
  blocks: InventoryBlockRow[];
}

/** 读取这些款式的全部库存件，以及每件现在的状态、即将到来的预订和手动锁定 */
export async function loadInventory(
  supabase: AdminClient,
  styleIds: string[],
  today: IsoDate,
): Promise<Map<string, ItemOverview[]>> {
  const byStyle = new Map<string, ItemOverview[]>();
  if (styleIds.length === 0) return byStyle;

  const { data: items, error } = await supabase
    .from("inventory_items")
    .select("*")
    .in("style_id", styleIds)
    .order("code");
  if (error) throw new Error(`读取库存失败：${error.message}`);

  const itemIds = items.map((i) => i.id);
  const [bookings, blocks] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_no, inventory_item_id, start_date, end_date, buffer_days, lead_days, tail_days, status, customer_name, parent_booking_id",
      )
      .in("inventory_item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"])
      .in("status", ["pending", "confirmed", "picked_up", "returned"])
      // 只看最近的：已归还超过一个月的不影响现在的状态
      .gte("end_date", addDays(today, -30)),
    supabase
      .from("inventory_blocks")
      .select("*")
      .in("inventory_item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("end_date", today)
      .order("start_date"),
  ]);
  if (bookings.error) throw new Error(`读取订单失败：${bookings.error.message}`);
  if (blocks.error) throw new Error(`读取锁定日期失败：${blocks.error.message}`);

  for (const item of items) {
    const reservations: ItemReservation[] = bookings.data
      .filter((b) => b.inventory_item_id === item.id)
      .map((b) => ({
        id: b.id,
        booking_no: b.booking_no,
        customer_name: b.customer_name,
        parent_booking_id: b.parent_booking_id,
        start: b.start_date as IsoDate,
        end: b.end_date as IsoDate,
        bufferDays: b.buffer_days,
        leadDays: b.lead_days,
        tailDays: b.tail_days,
        status: b.status,
      }));
    const itemBlocks = blocks.data.filter((k) => k.inventory_item_id === item.id);
    const overview: ItemOverview = {
      item,
      state: itemState({
        status: item.status,
        today,
        bookings: reservations,
        blocks: itemBlocks.map((k) => ({ start: k.start_date as IsoDate, end: k.end_date as IsoDate })),
      }),
      upcoming: upcomingBookings(reservations, today),
      blocks: itemBlocks,
    };
    byStyle.set(item.style_id, [...(byStyle.get(item.style_id) ?? []), overview]);
  }
  return byStyle;
}
