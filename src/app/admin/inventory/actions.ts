"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { parsePriceList, dollarsToCents } from "@/lib/admin/price-form";
import type { AccountFormState } from "@/lib/account/form-state";
import { blockedInterval, intervalsOverlap, isBlockingStatus } from "@/lib/booking/rules";
import type { IsoDate } from "@/lib/dates";
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

const addItemSchema = z.object({
  styleId: z.uuid(),
  size: z.string().trim().min(1, "请填尺码").max(20, "尺码太长了"),
  code: z.string().trim().max(40).default(""),
});

/** 加一件库存（尺码必填，编号不填时自动生成：网址名-序号） */
export async function addInventoryItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const back = returnPath(formData);
  const fail = (message: string): never => redirect(`${back}?itemError=${encodeURIComponent(message)}#items`);
  const parsed = addItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { styleId, size } = parsed.data;

  const [style, items] = await Promise.all([
    supabase.from("styles").select("slug").eq("id", styleId).single(),
    supabase.from("inventory_items").select("code").eq("style_id", styleId),
  ]);
  if (style.error) throw new Error(`读取款式失败：${style.error.message}`);
  if (items.error) throw new Error(`读取库存失败：${items.error.message}`);

  let code = parsed.data.code.toUpperCase();
  if (!code) code = await nextItemCode(supabase, items.data.map((i) => i.code), style.data.slug);

  const { error } = await supabase.from("inventory_items").insert({ style_id: styleId, size, code });
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

/** 款式基本信息：中英文名称、押金、单独的价目表、排序、是否上架 */
export async function saveStyle(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireAdmin();
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const values = {
    name: str("name"),
    nameEn: str("nameEn"),
    deposit: str("deposit"),
    prices: str("prices"),
    sortOrder: str("sortOrder"),
  };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: "款式不正确", values };

  const fieldErrors: Record<string, string> = {};
  if (!values.name || values.name.length > 60) fieldErrors.name = "请填写名称（60 字以内）";
  if (!values.nameEn || values.nameEn.length > 120) fieldErrors.nameEn = "请填写英文名称（120 字以内）";
  const deposit = dollarsToCents(values.deposit);
  if (deposit === null) fieldErrors.deposit = "押金请填 0–5000 之间的数字";
  const prices = parsePriceList(values.prices);
  if (!prices.ok) fieldErrors.prices = "价目表请填数字，用逗号隔开，例如 15, 22, 22, 28";
  const sortOrder = Number(values.sortOrder || 0);
  if (!Number.isInteger(sortOrder)) fieldErrors.sortOrder = "排序请填整数";

  const { data: style, error: readError } = await supabase.from("styles").select("category").eq("id", id.data).single();
  if (readError) return { message: `读取款式失败：${readError.message}`, values };
  if (prices.ok && prices.cents === null && (style.category === "gloves" || style.category === "helmet_cover")) {
    fieldErrors.prices = "手套和头盔套需要自己的价目表";
  }
  if (Object.keys(fieldErrors).length > 0) return { message: "请检查标红的内容", fieldErrors, values };

  const rentalPrices = prices.ok ? prices.cents : null;
  const { error } = await supabase
    .from("styles")
    .update({
      name: values.name,
      name_en: values.nameEn,
      deposit_cents: deposit ?? 0,
      rental_prices_cents: rentalPrices,
      ...(rentalPrices ? { daily_price_cents: rentalPrices[0] } : {}),
      sort_order: sortOrder,
      is_active: formData.get("isActive") === "on",
    })
    .eq("id", id.data);
  if (error) return { message: `保存失败：${error.message}`, values };

  revalidatePath(`/admin/inventory/${id.data}`);
  return { notice: "已保存。", values };
}
