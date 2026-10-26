/**
 * 购物车：存在顾客自己的浏览器里（localStorage），不登录也能用。
 * 只存“哪一款、哪个尺码、哪几天、加购了哪些头盔套”；名称、价格、是否有货每次打开购物车时向服务端重新查询，
 * 提交订单时服务端和数据库还会再校验一遍。
 */

import { useSyncExternalStore } from "react";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import type { IsoDate } from "@/lib/dates";

export { MAX_CART_LINES };

export interface CartLine {
  /** 购物车里这一行的编号（浏览器生成），删除时用 */
  id: string;
  styleId: string;
  size: string;
  start: IsoDate;
  end: IsoDate;
  /** 加购的头盔套款式 id（只有雪服能加购） */
  addOnIds: string[];
}

const STORAGE_KEY = "sunny-closet-cart-v1";
const CHANGE_EVENT = "sunny-closet-cart-change";
const EMPTY: CartLine[] = [];

let cache: { raw: string | null; lines: CartLine[] } = { raw: null, lines: EMPTY };

function isLine(value: unknown): value is CartLine {
  const v = value as Partial<CartLine> | null;
  return (
    typeof v?.id === "string" &&
    typeof v.styleId === "string" &&
    typeof v.size === "string" &&
    typeof v.start === "string" &&
    typeof v.end === "string" &&
    Array.isArray(v.addOnIds) &&
    v.addOnIds.every((id) => typeof id === "string")
  );
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 读购物车。内容没变时返回同一个数组（useSyncExternalStore 需要） */
export function getCart(): CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw === cache.raw) return cache.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) lines = parsed.filter(isLine).slice(0, MAX_CART_LINES);
  } catch {
    lines = EMPTY;
  }
  cache = { raw, lines };
  return lines;
}

function save(lines: CartLine[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // 隐私模式等存不了时，购物车只在这个页面里有效
    cache = { raw: JSON.stringify(lines), lines };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 放进购物车；满了返回 false */
export function addToCart(line: Omit<CartLine, "id">): boolean {
  const lines = getCart();
  if (lines.length >= MAX_CART_LINES) return false;
  save([...lines, { ...line, id: newId() }]);
  return true;
}

export function removeFromCart(id: string) {
  save(getCart().filter((l) => l.id !== id));
}

export function clearCart() {
  save([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  // 其他标签页改了购物车
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 在组件里读购物车，内容变了自动刷新。服务端渲染时是空的 */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, getCart, () => EMPTY);
}
