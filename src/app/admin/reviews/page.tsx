import Link from "next/link";
import { Suspense } from "react";
import { setReviewStatus } from "@/app/admin/reviews/actions";
import { AdminNav } from "@/components/admin-nav";
import { requireAdmin } from "@/lib/admin/auth";
import type { ReviewStatus } from "@/lib/supabase/database.types";

const SECTIONS: { status: ReviewStatus; title: string; empty: string }[] = [
  { status: "pending", title: "待审核", empty: "没有新评价。" },
  { status: "published", title: "已发布到网站", empty: "还没有发布的评价。" },
  { status: "hidden", title: "不展示", empty: "—" },
];

/** 后台：顾客评价。新评价先在这里，选择发布后才出现在商品页 */
export default function AdminReviewsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <ReviewList />
      </Suspense>
    </div>
  );
}

async function ReviewList() {
  const { supabase } = await requireAdmin();
  const { data: reviews, error } = await supabase
    .rpc("admin_list_reviews")
    .select("id, booking_id, style_id, rating, body, display_name, locale, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`读取评价失败：${error.message}`);

  const [styles, bookings] = await Promise.all([
    supabase.from("styles").select("id, name, brand, slug").in("id", reviews.length ? [...new Set(reviews.map((r) => r.style_id))] : [""]),
    supabase
      .from("bookings")
      .select("id, booking_no, customer_name, end_date")
      .in("id", reviews.length ? reviews.map((r) => r.booking_id) : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const style = (id: string) => styles.data?.find((s) => s.id === id);
  const booking = (id: string) => bookings.data?.find((b) => b.id === id);

  return (
    <>
      <AdminNav current="reviews" />
      <p className="mt-6 text-sm text-neutral-600">
        顾客的订单状态改成“已归还”后，订单页会出现评价表单。新评价先放在“待审核”，点“发布到网站”后会显示在那件商品的详情页上。
      </p>
      {SECTIONS.map((section) => {
        const list = reviews.filter((r) => r.status === section.status);
        return (
          <section key={section.status} className="mt-10">
            <h2 className="text-lg font-bold">
              {section.title} <span className="text-sm font-normal text-neutral-500">{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">{section.empty}</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {list.map((review) => {
                  const s = style(review.style_id);
                  const b = booking(review.booking_id);
                  return (
                    <li key={review.id} className="border border-neutral-200 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-lg tracking-widest">
                          {"★".repeat(review.rating)}
                          <span className="text-neutral-300">{"★".repeat(5 - review.rating)}</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(review.created_at).toLocaleDateString("zh-CN")}
                          {review.locale === "en" ? " · 英文" : ""}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm">{review.body}</p>
                      <p className="mt-2 text-sm text-neutral-600">
                        — {review.display_name}
                        <span className="text-neutral-400">
                          {" "}
                          （{b?.customer_name} · <span className="font-mono">{b?.booking_no}</span>）
                        </span>
                      </p>
                      {s && (
                        <p className="mt-1 text-xs text-neutral-500">
                          <Link href={`/admin/inventory/${s.id}`} className="underline underline-offset-2">
                            {[s.brand, s.name].filter(Boolean).join(" ")}
                          </Link>
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {review.status !== "published" && (
                          <StatusButton id={review.id} status="published" label="发布到网站" primary />
                        )}
                        {review.status !== "hidden" && <StatusButton id={review.id} status="hidden" label="不展示" />}
                        {review.status !== "pending" && <StatusButton id={review.id} status="pending" label="放回待审核" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function StatusButton({ id, status, label, primary }: { id: string; status: ReviewStatus; label: string; primary?: boolean }) {
  return (
    <form action={setReviewStatus}>
      <input type="hidden" name="reviewId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          primary
            ? "h-9 rounded-full bg-neutral-900 px-4 text-xs font-bold text-white hover:bg-neutral-700"
            : "h-9 rounded-full border border-neutral-300 px-4 text-xs font-bold hover:border-neutral-900"
        }
      >
        {label}
      </button>
    </form>
  );
}
