import { z } from "zod";
import { shop } from "@/config/shop";
import { isIsoDate } from "@/lib/dates";
import { MAX_ADD_ONS_PER_OUTFIT } from "@/lib/helmet-covers";
import { getMessages, type Messages } from "@/messages";

/** 数字、加号、括号、短横线、点和空格，7–25 个字符 */
const PHONE_RE = /^[0-9+()\-.\s]{7,25}$/;

/** 顾客提交的预订表单。日期是否合法、是否有货、价格多少，都由服务端另行校验。错误提示按语言传入 */
export function createBookingRequestSchema(t: Messages["validation"]) {
  return z
    .object({
      styleId: z.uuid(t.styleId),
      size: z.string().trim().min(1, t.sizeRequired).max(20, t.sizeInvalid),
      start: z.string().refine(isIsoDate, t.startInvalid),
      end: z.string().refine(isIsoDate, t.endInvalid),
      name: z.string().trim().min(1, t.nameRequired).max(60, t.nameTooLong),
      phone: z.string().trim().regex(PHONE_RE, t.phoneInvalid),
      email: z.string().trim().toLowerCase().max(120, t.emailTooLong).pipe(z.email(t.emailInvalid)),
      wechat: z.string().trim().max(60, t.wechatTooLong).default(""),
      fulfillment: z.enum(shop.fulfillmentMethods, t.fulfillmentRequired),
      shippingAddress: z.string().trim().max(300, t.addressTooLong).default(""),
      note: z.string().trim().max(500, t.noteTooLong).default(""),
    })
    .superRefine((value, ctx) => {
      if (value.fulfillment === "shipping" && value.shippingAddress.length < 6) {
        ctx.addIssue({
          code: "custom",
          path: ["shippingAddress"],
          message: t.addressRequired,
        });
      }
    });
}

/** 中文提示的版本 */
export const bookingRequestSchema = createBookingRequestSchema(getMessages("zh").validation);

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

/** 表单里的加购配件（每件一个 name="addOn" 的隐藏输入框），不能重复 */
export const addOnIdsSchema = z
  .array(z.uuid())
  .max(MAX_ADD_ONS_PER_OUTFIT)
  .refine((ids) => new Set(ids).size === ids.length);

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
