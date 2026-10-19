import Image from "next/image";
import { thumbUrl } from "@/lib/images";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { ItemStateBadge } from "@/components/admin-item-state";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory } from "@/lib/admin/inventory";
import { styleKind, stylePriceTable, type StyleKind } from "@/lib/catalog";
import { formatShortDateZh, todayIn } from "@/lib/dates";
import { ITEM_STATES } from "@/lib/inventory/status";
import { formatMoney } from "@/lib/money";
import { messages } from "@/messages/zh-CN";

const GROUPS: { kind: StyleKind; title: string }[] = [
  { kind: "outfit", title: "雪服" },
  { kind: "helmet_cover", title: "头盔套" },
  { kind: "gloves", title: "手套" },
];

export default function AdminInventoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <InventoryList />
      </Suspense>
    </div>
  );
}

async function InventoryList() {
  const { supabase } = await requireAdmin();
  const today = todayIn(shop.timeZone);

  const [stylesResult, settingsResult] = await Promise.all([
    supabase
      .from("styles")
      .select("id, slug, name, brand, category, is_active, image_urls, deposit_cents, rental_prices_cents")
      .order("sort_order")
      .order("name"),
    supabase.from("settings").select("rental_prices_cents, jacket_prices_cents, pants_prices_cents").single(),
  ]);
  if (stylesResult.error) throw new Error(`读取款式失败：${stylesResult.error.message}`);
  if (settingsResult.error) throw new Error(`读取设置失败：${settingsResult.error.message}`);
  const styles = stylesResult.data;
  const s = settingsResult.data;
  const tables = {
    rentalPricesCents: s.rental_prices_cents,
    jacketPricesCents: s.jacket_prices_cents,
    pantsPricesCents: s.pants_prices_cents,
  };

  const inventory = await loadInventory(supabase, styles.map((x) => x.id), today);
  const allItems = [...inventory.values()].flat();
  const stateCounts = ITEM_STATES.map((state) => ({
    state,
    count: allItems.filter((i) => i.state === state).length,
  })).filter((x) => x.count > 0);

  return (
    <>
      <AdminNav current="inventory" />
      <p className="mt-6 flex flex-wrap gap-2 text-sm text-neutral-600">
        <span>
          共 {styles.length} 款 · {allItems.length} 件
        </span>
        {stateCounts.map(({ state, count }) => (
          <span key={state} className="inline-flex items-center gap-1">
            <ItemStateBadge state={state} /> {count}
          </span>
        ))}
      </p>

      {GROUPS.map((group) => {
        const list = styles.filter((x) => styleKind(x.category) === group.kind);
        if (list.length === 0) return null;
        return (
          <section key={group.kind} className="mt-10">
            <h2 className="text-lg font-bold">
              {group.title} <span className="text-sm font-normal text-neutral-500">{list.length} 款</span>
            </h2>
            <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
              {list.map((style) => {
                const items = inventory.get(style.id) ?? [];
                const next = items.flatMap((i) => i.upcoming).sort((a, b) => a.start.localeCompare(b.start))[0];
                // 头盔套有专门的编辑页（档位、加购价、标签）
                const href =
                  style.category === "helmet_cover" ? `/admin/helmet-covers/${style.id}` : `/admin/inventory/${style.id}`;
                return (
                  <li key={style.id}>
                    <Link href={href} className="flex gap-4 py-4 hover:bg-neutral-50">
                      <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-neutral-100">
                        {style.image_urls[0] && (
                          <Image src={thumbUrl(style.image_urls[0])} alt="" fill sizes="56px" unoptimized className="object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{style.name}</span>
                          {!style.is_active && <span className="text-xs text-red-600">已下架</span>}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {[style.brand, messages.categories[style.category]].filter(Boolean).join(" · ")} · 起租{" "}
                          {formatMoney(stylePriceTable(style, tables)[0], { whole: true })} · 押金{" "}
                          {formatMoney(style.deposit_cents, { whole: true })}
                          {style.rental_prices_cents && style.category !== "helmet_cover" && style.category !== "gloves"
                            ? " · 单独定价"
                            : ""}
                        </p>
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {items.map((i) => (
                            <span key={i.item.id} className="inline-flex items-center gap-1">
                              <span className="text-neutral-500">{i.item.size}</span>
                              <ItemStateBadge state={i.state} />
                            </span>
                          ))}
                          {items.length === 0 && <span className="text-red-600">没有库存</span>}
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
          </section>
        );
      })}
      <p className="mt-6 text-xs text-neutral-500">{messages.admin.itemStatesHint}</p>
      <p className="mt-2 text-xs text-neutral-500">
        新上架的款式还是通过商品清单导入（catalog 文件夹 + npm run import:catalog），头盔套可以在“头盔套”里直接新增。
      </p>
    </>
  );
}
