/**
 * 邮寄：只寄美国本土 48 州 + 华盛顿特区，全美包邮（不收运费）。
 * 这里是结算表单的州下拉选项、邮编格式，以及存进订单的一行地址怎么拼。
 */

import { shop } from "@/config/shop";

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

/** 文案（款式页、下单表单、租赁须知）里用到的数字：邮寄最短天数、提前几天下单 */
export function shippingPolicyArgs(minDays: number): [number, number] {
  return [minDays, shop.shipping.orderAheadDays];
}
