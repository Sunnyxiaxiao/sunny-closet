import Image from "next/image";
import { thumbUrl } from "@/lib/images";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { ItemStateBadge } from "@/components/admin-item-state";
import { TierBadge } from "@/components/helmet-cover-card";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory } from "@/lib/admin/inventory";
import { formatShortDateZh, todayIn } from "@/lib/dates";
import { HELMET_COVER_CATEGORY } from "@/lib/helmet-covers";
import { ITEM_STATES } from "@/lib/inventory/status";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

export default function AdminHelmetCoversPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <HelmetCoverList />
      </Suspense>
    </div>
  );
}

async function HelmetCoverList() {
  const { supabase } = await requireAdmin();
  const today = todayIn(shop.timeZone);

  const { data: covers, error } = await supabase
    .from("styles")
    .select("id, slug, name, tier, is_active, image_urls, addon_price_cents")
    .eq("category", HELMET_COVER_CATEGORY)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`读取头盔套失败：${error.message}`);

  const inventory = await loadInventory(supabase, covers.map((c) => c.id), today);
  const allItems = [...inventory.values()].flat();
  const stateCounts = ITEM_STATES.map((state) => ({
    state,
    count: allItems.filter((i) => i.state === state).length,
  })).filter((s) => s.count > 0);

  return (
    <>
      <AdminNav current="helmet-covers" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap gap-2 text-sm text-neutral-600">
          <span>
            共 {covers.length} 款 · {allItems.length} 件
          </span>
          {stateCounts.map(({ state, count }) => (
            <span key={state} className="inline-flex items-center gap-1">
              <ItemStateBadge state={state} /> {count}
            </span>
          ))}
        </p>
        <Link
          href="/admin/helmet-covers/new"
          className="inline-flex h-10 items-center rounded-full bg-neutral-900 px-5 text-sm font-bold text-white hover:bg-neutral-700"
        >
          + 新增头盔套
        </Link>
      </div>

      {covers.length === 0 ? (
        <p className="mt-10 text-center text-neutral-500">还没有头盔套，点右上角新增。</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
          {covers.map((cover) => {
            const items = inventory.get(cover.id) ?? [];
            const next = items
              .flatMap((i) => i.upcoming)
              .sort((a, b) => a.start.localeCompare(b.start))[0];
            return (
              <li key={cover.id}>
                <Link href={`/admin/helmet-covers/${cover.id}`} className="flex gap-4 py-4 hover:bg-neutral-50">
                  <div className="relative aspect-square w-16 shrink-0 overflow-hidden bg-neutral-100">
                    {cover.image_urls[0] && (
                      <Image src={thumbUrl(cover.image_urls[0])} alt="" fill sizes="64px" unoptimized className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{cover.name}</span>
                      {cover.tier && <TierBadge tier={cover.tier} locale="zh" />}
                      {!cover.is_active && <span className="text-xs text-red-600">已下架</span>}
                    </p>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {items.map((i) => (
                        <span key={i.item.id} className="inline-flex items-center gap-1">
                          <span className="font-mono text-neutral-500">{i.item.code}</span>
                          <ItemStateBadge state={i.state} />
                        </span>
                      ))}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {next
                        ? `下一笔预订：${formatShortDateZh(next.start)} – ${formatShortDateZh(next.end)}（${messages.bookingStatus[next.status]}）`
                        : "暂无预订"}
                    </p>
                  </div>
                  <span className="self-center text-neutral-400" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-neutral-500">{t.itemStatesHint}</p>
    </>
  );
}
