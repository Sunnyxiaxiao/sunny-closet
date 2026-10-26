import { z } from "zod";
import { shop } from "@/config/shop";
import { MAX_CART_LINES } from "@/lib/cart-limits";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { MAX_ADD_ONS_PER_OUTFIT } from "@/lib/helmet-covers";
import { isShippingState, ZIP_RE } from "@/lib/shipping";
import { getMessages, type Messages } from "@/messages";

/** 数字、加号、括号、短横线、点和空格，7–25 个字符 */
const PHONE_RE = /^[0-9+()\-.\s]{7,25}$/;

/**
 * 购物车结算表单：联系方式、取件方式、邮寄地址。
 * 买了哪几件见 cartLinesSchema；价格、是否有货、日期是否合法都由服务端另行校验。错误提示按语言传入
 */
export function createCheckoutSchema(t: Messages["validation"]) {
  return z
    .object({
      name: z.string().trim().min(1, t.nameRequired).max(60, t.nameTooLong),
      phone: z.string().trim().regex(PHONE_RE, t.phoneInvalid),
      email: z.string().trim().toLowerCase().max(120, t.emailTooLong).pipe(z.email(t.emailInvalid)),
      wechat: z.string().trim().max(60, t.wechatTooLong).default(""),
      fulfillment: z.enum(shop.fulfillmentMethods, t.fulfillmentRequired),
      // 邮寄地址：街道、城市、州（本土 48 州 + DC）、邮编，提交时拼成一行存进 shipping_address。到店自取时不填、也不校验
      shippingStreet: z.string().trim().max(200, t.addressTooLong).default(""),
      shippingCity: z.string().trim().max(80, t.addressTooLong).default(""),
      shippingState: z.string().trim().toUpperCase().default(""),
      shippingZip: z.string().trim().default(""),
      note: z.string().trim().max(500, t.noteTooLong).default(""),
    })
    .superRefine((value, ctx) => {
      if (value.fulfillment !== "shipping") return;
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (value.shippingStreet.length < 3) issue("shippingStreet", t.streetRequired);
      if (value.shippingCity.length < 2) issue("shippingCity", t.cityRequired);
      if (!isShippingState(value.shippingState)) issue("shippingState", t.stateRequired);
      if (!ZIP_RE.test(value.shippingZip)) issue("shippingZip", t.zipInvalid);
    });
}

/** 中文提示的版本 */
export const checkoutSchema = createCheckoutSchema(getMessages("zh").validation);

export type CheckoutRequest = z.infer<typeof checkoutSchema>;

/** 购物车里的一件：哪一款、哪个尺码、哪几天（滑雪日）、加购了哪些头盔套 */
export const cartLineSchema = z.object({
  id: z.string().min(1).max(64),
  styleId: z.uuid(),
  size: z.string().trim().min(1).max(20),
  start: z.string().refine(isIsoDate),
  end: z.string().refine(isIsoDate),
  addOnIds: z
    .array(z.uuid())
    .max(MAX_ADD_ONS_PER_OUTFIT)
    .refine((ids) => new Set(ids).size === ids.length)
    .default([]),
});

export type CartLineInput = Omit<z.infer<typeof cartLineSchema>, "start" | "end"> & { start: IsoDate; end: IsoDate };

/** 整个购物车：1–10 件 */
export const cartLinesSchema = z
  .array(cartLineSchema)
  .min(1)
  .max(MAX_CART_LINES)
  .transform((lines) => lines as CartLineInput[]);

/** 每个字段只取第一条错误，方便显示在输入框下面 */
export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error);
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const first = Array.isArray(messages) ? messages[0] : undefined;
    if (first) result[field] = first;
  }
  return result;
}

/** 数据库只有一个备注字段，微信号和备注合并后存进去 */
export function buildCustomerNote(input: { wechat: string; note: string }): string {
  return [input.wechat ? `微信号：${input.wechat}` : "", input.note].filter(Boolean).join("\n");
}
