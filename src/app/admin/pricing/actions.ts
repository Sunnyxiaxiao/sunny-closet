"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { PRICE_TABLES, parsePriceRow } from "@/lib/admin/price-form";
import type { AccountFormState } from "@/lib/account/form-state";
import type { Database } from "@/lib/supabase/database.types";

/** 保存三张价目表和邮寄最短天数。数据库只允许管理员改（settings_admin_update 策略） */
export async function savePrices(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const { supabase } = await requireAdmin();
  const values = Object.fromEntries(
    [...formData].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ) as Record<string, string>;

  const { data: settings, error: readError } = await supabase.from("settings").select("max_rental_days").single();
  if (readError) return { message: `读取设置失败：${readError.message}`, values };
  const days = settings.max_rental_days;

  const update: Database["public"]["Tables"]["settings"]["Update"] = {};
  const fieldErrors: Record<string, string> = {};
  for (const table of PRICE_TABLES) {
    const row = parsePriceRow(Array.from({ length: days }, (_, i) => values[`${table.key}-${i + 1}`] ?? ""));
    if (row.ok) update[table.column] = row.cents;
    else fieldErrors[table.key] = `第 ${row.day} 天的价格请填 0–5000 之间的数字`;
  }
  const minDays = Number(values.shippingMinDays);
  if (!Number.isInteger(minDays) || minDays < 1 || minDays > days) {
    fieldErrors.shippingMinDays = `请填 1–${days} 的整数`;
  } else {
    update.shipping_min_days = minDays;
  }
  if (Object.keys(fieldErrors).length > 0) return { message: "请检查标红的内容", fieldErrors, values };

  const { data, error } = await supabase.from("settings").update(update).eq("id", true).select("id");
  if (error || !data?.length) return { message: `保存失败：${error?.message ?? "没有权限"}`, values };

  revalidatePath("/admin/pricing");
  return { notice: "已保存，网站上的价格已经更新。之前下的订单不受影响。", values };
}
