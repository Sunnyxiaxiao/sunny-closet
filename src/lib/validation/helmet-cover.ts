import { z } from "zod";
import { HELMET_COVER_TIERS, normalizeTags } from "@/lib/helmet-covers";

/** 后台填的是美元（可以带小数），存进数据库前换算成美分 */
const dollars = (label: string) =>
  z.coerce
    .number(`${label}请填数字`)
    .min(0, `${label}不能小于 0`)
    .max(5000, `${label}太大了`)
    .transform((value) => Math.round(value * 100));

const optionalDollars = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const parsed = dollars(label).safeParse(value);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: parsed.error.issues[0].message });
        return z.NEVER;
      }
      return parsed.data;
    });

/** 后台“新增 / 编辑头盔套”表单 */
export const helmetCoverFormSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  name: z.string().trim().min(1, "请填写名称").max(60, "名称太长了"),
  nameEn: z.string().trim().min(1, "请填写英文名称").max(120, "英文名称太长了"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "网址名只能用小写英文、数字和连字符，例如 pink-bunny"),
  description: z.string().trim().max(3000, "介绍太长了").default(""),
  descriptionEn: z.string().trim().max(6000, "英文介绍太长了").default(""),
  tier: z.enum(HELMET_COVER_TIERS, "请选择经典款或精选款"),
  tags: z.string().default("").transform(normalizeTags),
  oneDay: dollars("1 天价格"),
  twoToThreeDays: dollars("2–3 天价格"),
  fourToSevenDays: dollars("4–7 天价格"),
  addOn: dollars("搭配加购价"),
  replacementValue: optionalDollars("重置价值"),
  deposit: dollars("押金"),
  sortOrder: z.coerce.number("排序请填整数").int("排序请填整数").default(0),
  quantity: z.coerce.number().int().min(1, "数量至少 1 件").max(20, "数量最多 20 件").default(1),
  isActive: z.boolean(),
  imageUrls: z.array(z.url()).max(12, "最多 12 张图片"),
});

export type HelmetCoverForm = z.infer<typeof helmetCoverFormSchema>;

/** 后台锁定日期表单 */
export const inventoryBlockSchema = z
  .object({
    itemId: z.uuid(),
    start: z.iso.date("请选择开始日期"),
    end: z.iso.date("请选择结束日期"),
    reason: z.string().trim().max(200).default(""),
  })
  .refine((v) => v.end >= v.start, { message: "结束日期不能早于开始日期", path: ["end"] });
