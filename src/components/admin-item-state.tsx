import type { ItemState } from "@/lib/inventory/status";
import { messages } from "@/messages/zh-CN";

const COLORS: Record<ItemState, string> = {
  available: "bg-emerald-100 text-emerald-900",
  reserved: "bg-amber-100 text-amber-900",
  rented: "bg-sky-100 text-sky-900",
  returned: "bg-violet-100 text-violet-900",
  cleaning: "bg-neutral-200 text-neutral-800",
  unavailable: "bg-red-100 text-red-900",
};

export function ItemStateBadge({ state }: { state: ItemState }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold ${COLORS[state]}`}>{messages.admin.itemStates[state]}</span>
  );
}
