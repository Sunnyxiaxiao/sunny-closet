import "server-only";
import { connection } from "next/server";
import { shop } from "@/config/shop";
import { todayIn, type IsoDate } from "@/lib/dates";
import { sortSizes } from "@/lib/sizes";
import type { StyleRow } from "@/lib/supabase/database.types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * 前台读取商品与可用性的唯一入口（匿名身份，受 RLS 约束）。
 * 每个函数先调用 connection()，表示数据在请求时实时读取，不在构建时预渲染。
 */

export type PublicStyle = Pick<
  StyleRow,
  | "id"
  | "slug"
  | "brand"
  | "category"
  | "name"
  | "description"
  | "daily_price_cents"
  | "deposit_cents"
  | "image_urls"
  | "source_url"
>;

const STYLE_COLUMNS =
  "id, slug, brand, category, name, description, daily_price_cents, deposit_cents, image_urls, source_url";

export interface ShopSettings {
  bufferDays: number;
  maxRentalDays: number;
}

export interface SizeAvailability {
  size: string;
  total: number;
  /** 未指定日期时等于 total */
  available: number;
}

export async function getToday(): Promise<IsoDate> {
  await connection();
  return todayIn(shop.timeZone);
}

export async function getSettings(): Promise<ShopSettings> {
  await connection();
  const { data, error } = await createSupabasePublicClient()
    .from("settings")
    .select("buffer_days, max_rental_days")
    .single();
  if (error) throw new Error(`读取店铺设置失败：${error.message}`);
  return { bufferDays: data.buffer_days, maxRentalDays: data.max_rental_days };
}

export async function listStyles(): Promise<PublicStyle[]> {
  await connection();
  const { data, error } = await createSupabasePublicClient()
    .from("styles")
    .select(STYLE_COLUMNS)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`读取款式失败：${error.message}`);
  return data;
}

export async function getStyleBySlug(slug: string): Promise<PublicStyle | null> {
  await connection();
  const { data, error } = await createSupabasePublicClient()
    .from("styles")
    .select(STYLE_COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`读取款式失败：${error.message}`);
  return data;
}

/**
 * 返回 款式 id → 各尺码可租件数。传入日期时按排期（含缓冲天数）计算。
 */
export async function getAvailability(options: {
  start?: IsoDate;
  end?: IsoDate;
  styleId?: string;
} = {}): Promise<Map<string, SizeAvailability[]>> {
  await connection();
  const { data, error } = await createSupabasePublicClient().rpc("get_availability", {
    p_start: options.start ?? null,
    p_end: options.end ?? null,
    p_style_id: options.styleId ?? null,
  });
  if (error) throw new Error(`查询可用性失败：${error.message}`);

  const byStyle = new Map<string, SizeAvailability[]>();
  for (const row of data) {
    const list = byStyle.get(row.style_id) ?? [];
    list.push({ size: row.size, total: row.total_count, available: row.available_count });
    byStyle.set(row.style_id, list);
  }
  for (const [styleId, list] of byStyle) {
    const order = sortSizes(list.map((s) => s.size));
    byStyle.set(
      styleId,
      list.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size)),
    );
  }
  return byStyle;
}
