/**
 * Cart: stored in the customer's own browser (localStorage), so no account is needed.
 * It stores only which style, size, dates and helmet-cover add-ons; names, prices and availability are re-fetched from the server every time the cart opens,
 * and the server and database validate everything again when the order is submitted.
 */

import { useSyncExternalStore } from "react";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import type { IsoDate } from "@/lib/dates";

export { MAX_CART_LINES };

export interface CartLine {
  /** ID of this cart line (generated in the browser), used for removal */
  id: string;
  styleId: string;
  size: string;
  start: IsoDate;
  end: IsoDate;
  /** Style ids of helmet-cover add-ons (outfits only) */
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

/** Reads the cart. Returns the same array while the contents are unchanged (required by useSyncExternalStore) */
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
    // When storage isn't available (e.g. private mode), the cart only lasts for this page
    cache = { raw: JSON.stringify(lines), lines };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Adds to the cart; returns false when full */
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
  // Another tab changed the cart
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Reads the cart in a component and re-renders on changes. Empty during SSR */
export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, getCart, () => EMPTY);
}
