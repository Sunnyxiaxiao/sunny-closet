/**
 * 取件 / 归还时间说明（纯函数）。只按滑雪日计费，前后的取件、归还、运输时间不收费：
 * - 到店自取：第一个滑雪日前一晚起可取件，最后一个滑雪日的次日中午前归还
 * - 邮寄：提前寄出，保证第一个滑雪日前送到；最后一个滑雪日的次日前把包裹交给快递寄回
 */

import type { FulfillmentMethod } from "@/config/shop";
import type { Padding, RentalRange } from "@/lib/booking/rules";
import { addDays, formatShortDate } from "@/lib/dates";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

export interface Handover {
  /** 到店自取：最早取件日（晚上）；邮寄：寄出日 */
  out: string;
  /** 到店自取：归还截止日（中午）；邮寄：寄回截止日 */
  back: string;
}

export function handover(range: RentalRange, padding: Padding): Handover {
  return {
    out: addDays(range.start, -padding.leadDays),
    // 旧订单没有后置天数，归还日就是最后一天
    back: padding.tailDays > 0 ? addDays(range.end, 1) : range.end,
  };
}

/** 例：“12月19日晚上起可取件，12月23日中午前归还” / “12月17日寄出，请在12月23日前寄回”（英文同理） */
export function handoverText(
  range: RentalRange,
  method: FulfillmentMethod,
  padding: Padding,
  locale: Locale = "zh",
): string {
  const t = getMessages(locale).handover;
  const { out, back } = handover(range, padding);
  const date = (d: string) => formatShortDate(d, locale);
  if (method === "shipping") return t.shipping(date(out), date(back));
  const pickup = padding.leadDays > 0 ? t.pickupFromEvening(date(out)) : t.pickupOn(date(out));
  const ret = padding.tailDays > 0 ? t.returnByNoon(date(back)) : t.returnOn(date(back));
  return `${pickup}${t.join}${ret}`;
}
