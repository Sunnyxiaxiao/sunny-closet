"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { COST_ERROR, dollarsToCents, parseCost, parsePriceList } from "@/lib/admin/price-form";
import type { AccountFormState } from "@/lib/account/form-state";
import { blockedInterval, intervalsOverlap, isBlockingStatus } from "@/lib/booking/rules";
import type { IsoDate } from "@/lib/dates";
import {
  OUTFIT_CATEGORIES,
  SLUG_RE,
  codePrefix,
  defaultDailyCents,
  defaultDeposit,
  mergeTags,
  slugify,
} from "@/lib/admin/style-form";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import type { StyleCategory } from "@/lib/supabase/database.types";
import { inventoryBlockSchema } from "@/lib/validation/helmet-cover";

/**
 * 后台“库存”：所有款式通用的库存件操作（可租 / 不可租、加一件、手动锁定日期）和款式基本信息。
 * 每个操作完成后回到 returnTo 指定的后台页面（只允许 /admin 下的地址）。
 */

function returnPath(formData: FormData) {
  const value = formData.get("returnTo");
  return typeof value === "string" && /^\/admin(\/[\w\-/]*)?$/.test(value) ? value : "/admin/inventory";
}

const itemStatusSchema = z.object({ itemId: z.uuid(), status: z.enum(["available", "inactive"]) });

/** 标记这件可租 / 不可租（不可租后不会再被预订，已有订单不受影响） */
export async function setItemStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = itemStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { error } = await supabase
    .from("inventory_items")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.itemId);
  if (error) throw new Error(`更新库存状态失败：${error.message}`);
  revalidatePath(returnPath(formData));
}

/** 录入 / 修改这件的采购价（美元，可以带小数）；清空 = 还没录入 */
export async function setItemCost(formData: FormData) {
  const { supabase } = await requireAdmin();
  const back = returnPath(formData);
  const itemId = z.uuid().safeParse(formData.get("itemId"));
  if (!itemId.success) return;
  const cents = parseCost(String(formData.get("cost") ?? ""));
  if (cents === undefined) redirect(`${back}?costError=${encodeURIComponent(COST_ERROR)}#items`);
  const { error } = await supabase.from("inventory_items").update({ purchase_cents: cents }).eq("id", itemId.data);
  if (error) throw new Error(`保存采购价失败：${error.message}`);
  revalidatePath(back);
  revalidatePath("/admin", "layout");
  redirect(`${back}#items`);
}

const addItemSchema = z.object({
  styleId: z.uuid(),
  size: z.string().trim().min(1, "请填尺码").max(20, "尺码太长了"),
  code: z.string().trim().max(40).default(""),
  cost: z.string().trim().default(""),
});

/** 加一件库存（尺码必填，编号不填时自动生成：网址名-序号；采购价选填） */
export async function addInventoryItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const back = returnPath(formData);
  const fail = (message: string): never => redirect(`${back}?itemError=${encodeURIComponent(message)}#items`);
  const parsed = addItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { styleId, size } = parsed.data;
  const purchaseCents = parseCost(parsed.data.cost);
  if (purchaseCents === undefined) return fail(COST_ERROR);

  const [style, items] = await Promise.all([
    supabase.from("styles").select("slug, bundle_style_ids").eq("id", styleId).single(),
    supabase.from("inventory_items").select("code").eq("style_id", styleId),
  ]);
  if (style.error) throw new Error(`读取款式失败：${style.error.message}`);
  if (items.error) throw new Error(`读取库存失败：${items.error.message}`);
  if (style.data.bundle_style_ids) return fail("整套的库存就是里面那几件单品，请到单品的页面加");

  let code = parsed.data.code.toUpperCase();
  if (!code) code = await nextItemCode(supabase, items.data.map((i) => i.code), style.data.slug);

  const { error } = await supabase.from("inventory_items").insert({ style_id: styleId, size, code, purchase_cents: purchaseCents });
  if (error?.code === "23505") return fail(`编号 ${code} 已经用过了，换一个`);
  if (error) throw new Error(`添加库存失败：${error.message}`);
  revalidatePath(back);
  redirect(`${back}#items`);
}

/**
 * 自动编号：接着这一款已有的编号系列往下排（例如已有 SC020 → 全店 SC 系列的下一个号 SC022）；
 * 这一款还没有库存、或编号不是“字母 + 数字”时，用“网址名-序号”。
 */
async function nextItemCode(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  styleCodes: string[],
  slug: string,
) {
  const series = styleCodes.map((c) => /^([A-Z]+)(\d+)$/.exec(c)).find(Boolean);
  if (series) {
    const [, prefix, digits] = series;
    const { data, error } = await supabase.from("inventory_items").select("code").like("code", `${prefix}%`);
    if (error) throw new Error(`读取库存编号失败：${error.message}`);
    const max = Math.max(
      0,
      ...data.map((i) => new RegExp(`^${prefix}(\\d+)$`).exec(i.code)).map((m) => (m ? Number(m[1]) : 0)),
    );
    return `${prefix}${String(max + 1).padStart(digits.length, "0")}`;
  }
  const codes = new Set(styleCodes);
  let n = styleCodes.length + 1;
  while (codes.has(`${slug.toUpperCase()}-${n}`)) n += 1;
  return `${slug.toUpperCase()}-${n}`;
}

/** 手动锁定日期。和已有订单（含取件前后、清洁缓冲）重叠时不锁，提示先处理订单 */
export async function addInventoryBlock(formData: FormData) {
  const { supabase } = await requireAdmin();
  const back = returnPath(formData);
  const done = (error?: string): never =>
    redirect(`${back}${error ? `?blockError=${encodeURIComponent(error)}` : ""}#items`);

  const parsed = inventoryBlockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return done(parsed.error.issues[0].message);
  const { itemId, start, end, reason } = parsed.data;

  const { data: bookings, error: readError } = await supabase
    .from("bookings")
    .select("booking_no, start_date, end_date, buffer_days, lead_days, tail_days, status")
    .eq("inventory_item_id", itemId);
  if (readError) throw new Error(`读取订单失败：${readError.message}`);

  const wanted = blockedInterval({ start: start as IsoDate, end: end as IsoDate }, 0);
  const conflict = bookings.find(
    (b) =>
      isBlockingStatus(b.status) &&
      intervalsOverlap(
        wanted,
        blockedInterval({ start: b.start_date as IsoDate, end: b.end_date as IsoDate }, b.buffer_days, {
          leadDays: b.lead_days,
          tailDays: b.tail_days,
        }),
      ),
  );
  if (conflict) return done(`这段时间已有订单 ${conflict.booking_no}，请先处理这笔订单`);

  const { error } = await supabase
    .from("inventory_blocks")
    .insert({ inventory_item_id: itemId, start_date: start, end_date: end, reason });
  if (error) throw new Error(`锁定日期失败：${error.message}`);
  revalidatePath(back);
  return done();
}

export async function deleteInventoryBlock(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = z.object({ blockId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { error } = await supabase.from("inventory_blocks").delete().eq("id", parsed.data.blockId);
  if (error) throw new Error(`取消锁定失败：${error.message}`);
  revalidatePath(returnPath(formData));
}

/**
 * 雪服 / 手套的基本信息：品牌、品类、中英文名称、押金、价目表、标签、排序、中英文商品介绍、是否上架。
 * 没有 id 时是新增：同时建好第一件库存（可带采购价）和图片，然后跳到编辑页继续管理。
 */
export async function saveStyle(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireAdmin();
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const text = (key: string) => String(formData.get(key) ?? "").replace(/\r\n?/g, "\n").trim();
  const values = {
    brand: str("brand"),
    name: str("name"),
    nameEn: str("nameEn"),
    slug: str("slug").toLowerCase(),
    deposit: str("deposit"),
    prices: str("prices"),
    replacementValue: str("replacementValue"),
    sortOrder: str("sortOrder"),
    description: text("description"),
    descriptionEn: text("descriptionEn"),
    size: str("size"),
    code: str("code").toUpperCase(),
    cost: str("cost").replace(/^\$/, ""),
  };
  const rawId = str("id");
  const id = rawId ? z.uuid().safeParse(rawId) : null;
  if (id && !id.success) return { message: "款式不正确", values };
  const gloves = formData.get("kind") === "gloves";
  const category = gloves ? "gloves" : str("category");
  if (!gloves && !(OUTFIT_CATEGORIES as readonly string[]).includes(category)) return { message: "请选择品类", values };
  const checkedTags = formData.getAll("tags").filter((t): t is string => typeof t === "string");

  const fieldErrors: Record<string, string> = {};
  if (values.brand.length > 60) fieldErrors.brand = "品牌太长了（60 字以内）";
  if (!values.name || values.name.length > 60) fieldErrors.name = "请填写名称（60 字以内）";
  if (!values.nameEn || values.nameEn.length > 120) fieldErrors.nameEn = "请填写英文名称（120 字以内）";
  const deposit = values.deposit === "" && !id ? null : dollarsToCents(values.deposit);
  if (values.deposit !== "" || id) {
    if (deposit === null) fieldErrors.deposit = "押金请填 0–5000 之间的数字";
  }
  const prices = parsePriceList(values.prices);
  if (!prices.ok) fieldErrors.prices = "价目表请填数字，用逗号隔开，例如 15, 22, 22, 28";
  else if (gloves && prices.cents === null) fieldErrors.prices = "手套需要自己的价目表";
  const replacement = values.replacementValue === "" ? null : dollarsToCents(values.replacementValue);
  if (values.replacementValue !== "" && replacement === null) fieldErrors.replacementValue = "请填 0–5000 之间的数字";
  const sortOrder = Number(values.sortOrder || 0);
  if (!Number.isInteger(sortOrder)) fieldErrors.sortOrder = "排序请填整数";
  if (values.description.length > 8000) fieldErrors.description = "介绍太长了（8000 字以内）";
  if (values.descriptionEn.length > 8000) fieldErrors.descriptionEn = "介绍太长了（8000 字以内）";

  // 新增才有的：网址名、第一件库存、图片
  const slug = values.slug || slugify(values.nameEn);
  const cost = values.cost === "" ? null : dollarsToCents(values.cost);
  const imageUrls = formData.getAll("imageUrls").filter((u): u is string => typeof u === "string");
  if (!id) {
    if (!SLUG_RE.test(slug)) fieldErrors.slug = "网址名只能用小写字母、数字和连字符";
    if (!values.size || values.size.length > 20) fieldErrors.size = "请填尺码（20 字以内）";
    if (values.code.length > 40) fieldErrors.code = "编号太长了";
    if (values.cost !== "" && cost === null) fieldErrors.cost = "采购价请填 0–5000 之间的数字";
    const bucketPrefix = `${getPublicSupabaseEnv().url}/storage/v1/object/public/style-images/`;
    if (imageUrls.length === 0) fieldErrors.imageUrls = "至少上传一张图";
    else if (imageUrls.some((url) => !url.startsWith(bucketPrefix))) fieldErrors.imageUrls = "图片地址不正确，请重新上传";
  }
  if (Object.keys(fieldErrors).length > 0) return { message: "请检查标红的内容", fieldErrors, values };

  const styleCategory = category as StyleCategory;
  let existingTags: string[] = [];
  if (id) {
    const { data: style, error: readError } = await supabase.from("styles").select("category, tags").eq("id", id.data).single();
    if (readError) return { message: `读取款式失败：${readError.message}`, values };
    // 头盔套有自己的编辑页；这里不能把雪服改成手套，也不能反过来
    if ((style.category === "gloves") !== gloves || style.category === "helmet_cover") {
      return { message: "品类不正确", values };
    }
    existingTags = style.tags;
  }
  const tags = mergeTags(existingTags, checkedTags, styleCategory);
  const rentalPrices = prices.ok ? prices.cents : null;
  const row = {
    brand: values.brand,
    category: styleCategory,
    name: values.name,
    name_en: values.nameEn,
    deposit_cents: deposit ?? defaultDeposit(styleCategory, tags) * 100,
    rental_prices_cents: rentalPrices,
    ...(gloves ? { replacement_value_cents: replacement } : {}),
    sort_order: sortOrder,
    description: values.description,
    description_en: values.descriptionEn,
    tags,
    is_active: formData.get("isActive") === "on",
  };

  if (id) {
    const { error } = await supabase
      .from("styles")
      .update({ ...row, ...(rentalPrices ? { daily_price_cents: rentalPrices[0] } : {}) })
      .eq("id", id.data);
    if (error) return { message: `保存失败：${error.message}`, values };
    revalidatePath(`/admin/inventory/${id.data}`);
    return { notice: "已保存。", values };
  }

  const { data: created, error } = await supabase
    .from("styles")
    .insert({ ...row, slug, daily_price_cents: defaultDailyCents(styleCategory, rentalPrices), image_urls: imageUrls })
    .select("id")
    .single();
  if (error?.code === "23505") return { fieldErrors: { slug: "这个网址名已经被用了，换一个" }, values };
  if (error) return { message: `保存失败：${error.message}`, values };

  const code = values.code || (await nextSeriesCode(supabase, codePrefix(styleCategory)));
  const { error: itemError } = await supabase
    .from("inventory_items")
    .insert({ style_id: created.id, size: values.size, code, purchase_cents: cost });
  if (itemError) {
    // 款式已经建好了，库存可以在编辑页补
    redirect(`/admin/inventory/${created.id}?itemError=${encodeURIComponent(
      itemError.code === "23505" ? `编号 ${code} 已经用过了，请在下面重新加一件` : `添加库存失败：${itemError.message}`,
    )}#items`);
  }
  revalidatePath(gloves ? "/admin/gloves" : "/admin/outfits");
  redirect(`/admin/inventory/${created.id}?created=1`);
}

/** 全店某个系列的下一个编号，例如已有 SC001–SC047 → SC048 */
async function nextSeriesCode(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], prefix: string) {
  const { data, error } = await supabase.from("inventory_items").select("code").like("code", `${prefix}%`);
  if (error) throw new Error(`读取库存编号失败：${error.message}`);
  const max = Math.max(0, ...data.map((i) => new RegExp(`^${prefix}(\\d+)$`).exec(i.code)).map((m) => (m ? Number(m[1]) : 0)));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** 款式图片：顺序（第一张是封面）、删除、新上传的图 */
export async function saveStyleImages(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: "款式不正确" };
  const urls = formData.getAll("imageUrls").filter((u): u is string => typeof u === "string");
  if (urls.length === 0) return { message: "至少留一张图" };
  // 只接受存在自己存储桶里的图片
  const bucketPrefix = `${getPublicSupabaseEnv().url}/storage/v1/object/public/style-images/`;
  if (urls.some((url) => !url.startsWith(bucketPrefix))) return { message: "图片地址不正确，请重新上传" };

  const { error } = await supabase.from("styles").update({ image_urls: urls }).eq("id", id.data);
  if (error) return { message: `保存失败：${error.message}` };
  revalidatePath(`/admin/inventory/${id.data}`);
  return { notice: "图片已保存，前台马上生效。" };
}
