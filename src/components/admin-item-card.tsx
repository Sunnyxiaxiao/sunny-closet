import { addInventoryBlock, deleteInventoryBlock, setItemCost, setItemStatus } from "@/app/admin/inventory/actions";
import { ItemStateBadge } from "@/components/admin-item-state";
import type { ItemOverview } from "@/lib/admin/inventory";
import { centsToDollars } from "@/lib/admin/price-form";
import { formatShortDateZh, type IsoDate } from "@/lib/dates";
import { messages } from "@/messages/zh-CN";

const dateInputClass = "h-10 border border-neutral-300 bg-white px-2 text-sm focus:border-neutral-900 focus:outline-none";

/** 后台一件库存：现在的状态、可租 / 不可租、采购价、即将到来的预订、手动锁定日期 */
export function AdminItemCard({
  overview,
  today,
  returnTo,
}: {
  overview: ItemOverview;
  today: IsoDate;
  /** 操作完成后回到哪个后台页面 */
  returnTo: string;
}) {
  const { item, state, upcoming, blocks } = overview;
  const active = item.status === "available";
  return (
    <li className="border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold">{item.code}</span>
          <span className="text-sm text-neutral-600">{item.size}</span>
          <ItemStateBadge state={state} />
        </p>
        <form action={setItemStatus}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="status" value={active ? "inactive" : "available"} />
          <button
            type="submit"
            className={[
              "h-9 rounded-full px-4 text-xs font-bold",
              active ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-neutral-900 text-white",
            ].join(" ")}
          >
            {active ? "标记不可租" : "恢复可租"}
          </button>
        </form>
      </div>

      <form action={setItemCost} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="itemId" value={item.id} />
        <label className="flex items-center gap-2 text-neutral-600">
          采购价 $
          <input
            name="cost"
            inputMode="decimal"
            defaultValue={item.purchase_cents === null ? "" : centsToDollars(item.purchase_cents)}
            placeholder="未填"
            className="h-9 w-24 border border-neutral-300 bg-white px-2 text-sm tabular-nums focus:border-neutral-900 focus:outline-none"
          />
        </label>
        <button type="submit" className="h-9 rounded-full border border-neutral-900 px-3 text-xs font-bold hover:bg-neutral-100">
          保存
        </button>
        <span className="text-xs text-neutral-400">只有你能看到</span>
      </form>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">即将到来的预订</h3>
      {upcoming.length === 0 ? (
        <p className="mt-1 text-sm text-neutral-500">暂无</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {upcoming.map((b) => (
            <li key={b.id} className="flex flex-wrap gap-x-3">
              <span className="tabular-nums">
                {formatShortDateZh(b.start)} – {formatShortDateZh(b.end)}
              </span>
              <span>{messages.bookingStatus[b.status]}</span>
              <span className="text-neutral-500">
                {b.customer_name} · <span className="font-mono">{b.booking_no}</span>
                {b.viaSet ? "（整套租）" : b.parent_booking_id ? "（搭配雪服加购）" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">手动锁定的日期</h3>
      {blocks.length > 0 && (
        <ul className="mt-1 space-y-1 text-sm">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-wrap items-center gap-x-3">
              <span className="tabular-nums">
                {formatShortDateZh(block.start_date)} – {formatShortDateZh(block.end_date)}
              </span>
              {block.reason && <span className="text-neutral-500">{block.reason}</span>}
              <form action={deleteInventoryBlock}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="blockId" value={block.id} />
                <button type="submit" className="text-xs text-red-600 underline underline-offset-2">
                  取消锁定
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addInventoryBlock} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="itemId" value={item.id} />
        <label className="flex flex-col text-xs text-neutral-500">
          开始
          <input type="date" name="start" required min={today} className={dateInputClass} />
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          结束
          <input type="date" name="end" required min={today} className={dateInputClass} />
        </label>
        <label className="flex min-w-32 flex-1 flex-col text-xs text-neutral-500">
          原因（选填）
          <input name="reason" maxLength={200} placeholder="例如：拍照、维修、送洗" className={dateInputClass} />
        </label>
        <button type="submit" className="h-10 rounded-full border border-neutral-900 px-4 text-xs font-bold hover:bg-neutral-100">
          锁定
        </button>
      </form>
    </li>
  );
}
