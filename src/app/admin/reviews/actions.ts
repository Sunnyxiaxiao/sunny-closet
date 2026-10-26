"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";

const schema = z.object({ reviewId: z.uuid(), status: z.enum(["published", "hidden", "pending"]) });

/** 发布到网站 / 不展示 / 撤回待审核 */
export async function setReviewStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { reviewId, status } = parsed.data;
  const { error } = await supabase
    .from("reviews")
    .update({ status, published_at: status === "published" ? new Date().toISOString() : null })
    .eq("id", reviewId);
  if (error) throw new Error(`更新评价失败：${error.message}`);
  revalidatePath("/admin/reviews");
}
