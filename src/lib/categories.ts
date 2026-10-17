import type { StyleCategory } from "@/lib/supabase/database.types";

/** 品类的展示顺序，与数据库 styles.category 的取值一致 */
export const STYLE_CATEGORIES = ["suit", "one_piece", "jacket", "pants"] as const satisfies readonly StyleCategory[];

export function isStyleCategory(value: unknown): value is StyleCategory {
  return typeof value === "string" && (STYLE_CATEGORIES as readonly string[]).includes(value);
}
