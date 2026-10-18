/**
 * 订单状态流转规则（纯函数）。后台按钮只会出现“允许的下一步”，服务端也会再校验一次。
 *
 * 待确认 → 已确认 / 已拒绝 / 已取消
 * 已确认 → 已取件 / 已取消
 * 已取件 → 已归还
 * 已归还、已拒绝、已取消 是终点，不能再改。
 *
 * 不允许“从已释放库存的状态改回占用库存的状态”，否则可能和别人新订的日期冲突。
 */

import type { BookingStatus } from "@/lib/supabase/database.types";

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "picked_up",
  "returned",
  "cancelled",
] as const satisfies readonly BookingStatus[];

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["picked_up", "cancelled"],
  picked_up: ["returned"],
  returned: [],
  rejected: [],
  cancelled: [],
};

export function nextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

/** 后台订单列表的分类标签 */
export const ADMIN_FILTERS = [
  { key: "pending", statuses: ["pending"] },
  { key: "confirmed", statuses: ["confirmed"] },
  { key: "picked_up", statuses: ["picked_up"] },
  { key: "returned", statuses: ["returned"] },
  { key: "closed", statuses: ["rejected", "cancelled"] },
  { key: "all", statuses: null },
] as const satisfies ReadonlyArray<{ key: string; statuses: readonly BookingStatus[] | null }>;

export type AdminFilterKey = (typeof ADMIN_FILTERS)[number]["key"];

export const DEFAULT_ADMIN_FILTER: AdminFilterKey = "pending";

export function parseAdminFilter(value: string | string[] | undefined): AdminFilterKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return ADMIN_FILTERS.find((f) => f.key === raw)?.key ?? DEFAULT_ADMIN_FILTER;
}

export function matchesAdminFilter(status: BookingStatus, filter: AdminFilterKey): boolean {
  const statuses: readonly BookingStatus[] | null =
    ADMIN_FILTERS.find((f) => f.key === filter)?.statuses ?? null;
  return statuses === null || statuses.includes(status);
}
