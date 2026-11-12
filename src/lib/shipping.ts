/**
 * 邮寄：只寄美国本土 48 州 + 华盛顿特区。
 * 这里是结算表单的州下拉选项、邮编格式、存进订单的一行地址怎么拼，以及运费怎么算。
 */

import { shop } from "@/config/shop";
import { isFullLook, oneAccessoryShort, type OutfitLine } from "@/lib/add-ons";

/** 可以邮寄的地区：美国本土 48 州 + 华盛顿特区（不含阿拉斯加、夏威夷和海外领地） */
export const SHIPPING_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export type ShippingState = (typeof SHIPPING_STATES)[number]["code"];

export const SHIPPING_STATE_CODES: readonly string[] = SHIPPING_STATES.map((s) => s.code);

export function isShippingState(code: string): code is ShippingState {
  return SHIPPING_STATE_CODES.includes(code);
}

/** 美国邮编：5 位，或 5 位 + 4 位 */
export const ZIP_RE = /^\d{5}(-\d{4})?$/;

/** 存进订单 shipping_address 的一行地址，例如 "1 Main St, Ithaca, NY 14850" */
export function formatShippingAddress(a: { street: string; city: string; state: string; zip: string }): string {
  return `${a.street}, ${a.city}, ${a.state} ${a.zip}`;
}

/**
 * 文案（款式页、下单表单、租赁须知）里用到的数字：邮寄最短天数、提前几天下单、
 * 包邮门槛、近区运费、远区运费、远区包邮补的运费（金额是美元整数）
 */
export function shippingPolicyArgs(minDays: number): [number, number, number, number, number, number, string] {
  const s = shop.shipping;
  return [minDays, s.orderAheadDays, s.freeSubtotalCents / 100, s.feeCents / 100, s.farFeeCents / 100, s.farFreeFeeCents / 100, s.farStates.join(", ")];
}

/** 算运费用到的每件信息：品类、租金、加购价合计、加购的是什么（头盔套 / 手套） */
export interface ShippingLine extends OutfitLine {
  rentalCents: number;
  addOnCents: number;
}

/** 购物车 / 订单里每件 → 算运费用的信息 */
export function shippingLines(
  lines: readonly {
    style: { category: string } | null;
    rentalCents: number;
    addOns: readonly { cents: number; category: string }[];
  }[],
): ShippingLine[] {
  return lines.map((l) => ({
    category: l.style?.category ?? "",
    rentalCents: l.rentalCents,
    addOnCents: l.addOns.reduce((sum, a) => sum + a.cents, 0),
    addOnCategories: l.addOns.map((a) => a.category),
  }));
}

/** 满足其一就包邮：租金 + 加购满 $99（押金不算），或有一整套 full look（上衣、裤子、头盔套、手套） */
export function qualifiesForFreeShipping(lines: readonly ShippingLine[]): boolean {
  if (isFullLook(lines)) return true;
  return lines.reduce((sum, l) => sum + l.rentalCents + l.addOnCents, 0) >= shop.shipping.freeSubtotalCents;
}

export function isFarState(state: string): boolean {
  return (shop.shipping.farStates as readonly string[]).includes(state);
}

/** 这单邮寄到这个州的运费（分）：包邮时近区 0、远区补一点；不包邮按州收。还没选州时按近区算 */
export function shippingFeeCents(lines: readonly ShippingLine[], state: string): number {
  const s = shop.shipping;
  if (qualifiesForFreeShipping(lines)) return isFarState(state) ? s.farFreeFeeCents : 0;
  return isFarState(state) ? s.farFeeCents : s.feeCents;
}

/** 购物车里那行“full look 包邮”小提示：还没包邮，衣服齐了、只差头盔套或手套其中一样 */
export function showFullLookTip(lines: readonly ShippingLine[]): boolean {
  return !qualifiesForFreeShipping(lines) && oneAccessoryShort(lines);
}

/** 急单加急费（分）：近区 $15，远区 $25；包邮也收 */
export function rushFeeCents(state: string): number {
  return isFarState(state) ? shop.shipping.rushFarFeeCents : shop.shipping.rushFeeCents;
}
