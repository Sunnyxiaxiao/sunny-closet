"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { COST_ERROR, parseCost } from "@/lib/admin/price-form";
import type { HelmetCoverFormState } from "@/lib/admin/helmet-cover-state";
import { HELMET_COVER_CATEGORY, HELMET_COVER_SIZE, standalonePriceTable } from "@/lib/helmet-covers";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import { firstFieldErrors } from "@/lib/validation/booking-request";
import { helmetCoverFormSchema } from "@/lib/validation/helmet-cover";

function refresh(id?: string) {
  revalidatePath("/admin/helmet-covers");
  if (id) revalidatePath(`/admin/helmet-covers/${id}`);
  // 前台中英文两个版本的头盔套页
  revalidatePath("/[lang]/helmet-covers", "layout");
}

/** 库存编号：HC-网址名-序号，例如 HC-PINK-BUNNY-2 */
function itemCode(slug: string, n: number) {
  return `HC-${slug.toUpperCase()}-${n}`;
}

/** 新增或编辑头盔套。新增时按数量建好库存件，然后跳到编辑页继续管理库存和锁定日期 */
export async function saveHelmetCover(
  _previous: HelmetCoverFormState,
  formData: FormData,
): Promise<HelmetCoverFormState> {
  const { supabase } = await requireAdmin();
  const values = Object.fromEntries(
    [...formData].flatMap(([key, value]) => (typeof value === "string" && key !== "imageUrls" ? [[key, value]] : [])),
  );

  const parsed = helmetCoverFormSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on",
    imageUrls: formData.getAll("imageUrls"),
  });
  if (!parsed.success) {
    return { message: "请检查标红的内容", fieldErrors: firstFieldErrors(parsed.error), values };
  }
  const input = parsed.data;

  // 只接受上传到自己存储桶里的图片
  const bucketPrefix = `${getPublicSupabaseEnv().url}/storage/v1/object/public/style-images/`;
  if (input.imageUrls.some((url) => !url.startsWith(bucketPrefix))) {
    return { message: "图片地址不正确，请重新上传", fieldErrors: { imageUrls: "图片地址不正确" }, values };
  }

  const prices = standalonePriceTable(input);
  const row = {
    slug: input.slug,
    name: input.name,
    name_en: input.nameEn,
    description: input.description,
    description_en: input.descriptionEn,
    category: HELMET_COVER_CATEGORY,
    tier: input.tier,
    tags: input.tags,
    daily_price_cents: prices[0],
    rental_prices_cents: prices,
    addon_price_cents: input.addOn,
    replacement_value_cents: input.replacementValue,
    deposit_cents: input.deposit,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    image_urls: input.imageUrls,
  };

  const result = input.id
    ? await supabase
        .from("styles")
        .update(row)
        .eq("id", input.id)
        .eq("category", HELMET_COVER_CATEGORY)
        .select("id")
        .single()
    : await supabase.from("styles").insert(row).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") return { fieldErrors: { slug: "这个网址名已经被用了，换一个" }, values };
    console.error("[saveHelmetCover] 保存失败", result.error);
    return { message: `保存失败：${result.error.message}`, values };
  }
  const id = result.data.id;

  if (!input.id) {
    const { error } = await supabase.from("inventory_items").insert(
      Array.from({ length: input.quantity }, (_, i) => ({
        style_id: id,
        size: HELMET_COVER_SIZE,
        code: itemCode(input.slug, i + 1),
        purchase_cents: input.cost,
      })),
    );
    if (error) {
      console.error("[saveHelmetCover] 创建库存失败", error);
      return { message: `头盔套已保存，但创建库存失败：${error.message}` };
    }
  }

  refresh(id);
  redirect(`/admin/helmet-covers/${id}?saved=1`);
}

const styleIdSchema = z.object({ styleId: z.uuid() });

/** 再加一件同款库存（采购价选填） */
export async function addHelmetCoverItem(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = styleIdSchema.safeParse({ styleId: formData.get("styleId") });
  if (!parsed.success) return;
  const purchaseCents = parseCost(String(formData.get("cost") ?? ""));
  if (purchaseCents === undefined) {
    redirect(`/admin/helmet-covers/${parsed.data.styleId}?costError=${encodeURIComponent(COST_ERROR)}#items`);
  }

  const [style, items] = await Promise.all([
    supabase.from("styles").select("slug").eq("id", parsed.data.styleId).single(),
    supabase.from("inventory_items").select("code").eq("style_id", parsed.data.styleId),
  ]);
  if (style.error) throw new Error(`读取头盔套失败：${style.error.message}`);
  if (items.error) throw new Error(`读取库存失败：${items.error.message}`);

  const codes = new Set(items.data.map((i) => i.code));
  let n = items.data.length + 1;
  while (codes.has(itemCode(style.data.slug, n))) n += 1;

  const { error } = await supabase.from("inventory_items").insert({
    style_id: parsed.data.styleId,
    size: HELMET_COVER_SIZE,
    code: itemCode(style.data.slug, n),
    purchase_cents: purchaseCents,
  });
  if (error) throw new Error(`添加库存失败：${error.message}`);
  refresh(parsed.data.styleId);
  redirect(`/admin/helmet-covers/${parsed.data.styleId}#items`);
}
