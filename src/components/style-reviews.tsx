import { connection } from "next/server";
import { shop } from "@/config/shop";
import type { Locale } from "@/i18n/config";
import { formatShortDate, type IsoDate } from "@/lib/dates";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { getMessages } from "@/messages";

/** 商品详情页底部：管理员发布过的顾客评价（中英文评价都显示）。没有评价时整块不显示 */
export async function StyleReviews({ styleId, locale }: { styleId: string; locale: Locale }) {
  await connection();
  const { data: reviews, error } = await createSupabasePublicClient()
    .from("reviews")
    .select("id, rating, body, display_name, published_at")
    .eq("style_id", styleId)
    .order("published_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[StyleReviews] 读取评价失败", error);
    return null;
  }
  if (reviews.length === 0) return null;

  const t = getMessages(locale).review;
  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return (
    <section className="px-4 pt-14 md:px-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-black">{t.sectionTitle}</h2>
        <p className="text-sm text-neutral-500">
          <span className="tracking-widest text-neutral-900">{"★".repeat(Math.round(average))}</span>{" "}
          {average.toFixed(1)} · {t.count(reviews.length)}
        </p>
      </div>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {reviews.map((review) => (
          <li key={review.id} className="border border-neutral-200 p-5">
            <p className="tracking-widest" aria-label={t.stars(review.rating)}>
              {"★".repeat(review.rating)}
              <span className="text-neutral-300">{"★".repeat(5 - review.rating)}</span>
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-800">{review.body}</p>
            <p className="mt-3 text-xs text-neutral-500">
              {review.display_name}
              {review.published_at && ` · ${formatShortDate(shopDate(review.published_at), locale)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 时间戳 → 店铺所在时区的日期（YYYY-MM-DD） */
function shopDate(timestamp: string): IsoDate {
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: shop.timeZone }) as IsoDate;
}
