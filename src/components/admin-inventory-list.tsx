import Image from "next/image";
import { thumbUrl } from "@/lib/images";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { ItemStateBadge } from "@/components/admin-item-state";
import { TierBadge } from "@/components/helmet-cover-card";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory, type ItemOverview } from "@/lib/admin/inventory";
import { SETTINGS_COLUMNS, styleKind, stylePriceTable, toShopSettings, type StyleKind } from "@/lib/catalog";
import { formatShortDateZh, todayIn } from "@/lib/dates";
import { ITEM_STATES } from "@/lib/inventory/status";
import { formatMoney } from "@/lib/money";
import { messages } from "@/messages/zh-CN";

const GROUPS: { kind: StyleKind; title: string }[] = [
  { kind: "outfit", title: "雪服" },
  { kind: "helmet_cover", title: "头盔套" },
  { kind: "gloves", title: "手套" },
];

const NAV_KEY = { outfit: "outfits", gloves: "gloves", helmet_cover: "helmet-covers" } as const;

/**
 * 后台的款式列表：每款的库存件状态、下一笔预订、成本。
 * only 不填 = 库存总览（全部品类 + 总成本）；填 outfit / gloves / helmet_cover = 只看这一类，并可以新增。
 */
export async function InventoryList({ only }: { only?: StyleKind }) {
  const { supabase } = await requireAdmin();
  const today = todayIn(shop.timeZone);

  const [stylesResult, settingsResult] = await Promise.all([
    supabase
      .from("styles")
      .select("id, slug, name, brand, category, tier, is_active, image_urls, deposit_cents, rental_prices_cents, tags, bundle_style_ids")
      .order("sort_order")
      .order("name"),
    supabase.from("settings").select(SETTINGS_COLUMNS).single(),
  ]);
  if (stylesResult.error) throw new Error(`读取款式失败：${stylesResult.error.message}`);
  if (settingsResult.error) throw new Error(`读取设置失败：${settingsResult.error.message}`);
  const styles = stylesResult.data.filter((x) => !only || styleKind(x.category) === only);
  const groups = GROUPS.filter((g) => !only || g.kind === only);
  const title = groups.length === 1 ? groups[0].title : null;
  const tables = toShopSettings(settingsResult.data, today);

  const inventory = await loadInventory(supabase, styles.map((x) => x.id), today);
  const allItems = [...inventory.values()].flat();
  const stateCounts = ITEM_STATES.map((state) => ({
    state,
    count: allItems.filter((i) => i.state === state).length,
  })).filter((x) => x.count > 0);
  const cost = costSummary(allItems);

  return (
    <>
      <AdminNav current={only ? NAV_KEY[only] : "inventory"} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap gap-2 text-sm text-neutral-600">
          <span>
            共 {styles.length} 款 · {allItems.length} 件
          </span>
          {stateCounts.map(({ state, count }) => (
            <span key={state} className="inline-flex items-center gap-1">
              <ItemStateBadge state={state} /> {count}
            </span>
          ))}
        </p>
        {only && (
          <Link
            href={only === "helmet_cover" ? "/admin/helmet-covers/new" : `/admin/inventory/new?kind=${only}`}
            className="inline-flex h-10 items-center rounded-full bg-neutral-900 px-5 text-sm font-bold text-white hover:bg-neutral-700"
          >
            + 新增{title}
          </Link>
        )}
      </div>

      <section className="mt-6 border border-neutral-200 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          {title ? `${title}成本（采购价合计）` : "总成本（采购价合计）"}
        </h2>
        <p className="mt-1 text-3xl font-black tabular-nums">{formatMoney(cost.cents)}</p>
        <p className="mt-1 text-xs text-neutral-500">
          已录入 {cost.priced} / {allItems.length} 件
          {cost.missing > 0 && <span className="text-amber-700"> · 还有 {cost.missing} 件没填采购价，没算进去</span>}
          {cost.priced > 0 && ` · 平均每件 ${formatMoney(Math.round(cost.cents / cost.priced))}`}
        </p>
        {!only && (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {groups.map((group) => {
              const ids = new Set(styles.filter((x) => styleKind(x.category) === group.kind).map((x) => x.id));
              const sub = costSummary(allItems.filter((i) => ids.has(i.item.style_id)));
              if (sub.priced + sub.missing === 0) return null;
              return (
                <div key={group.kind} className="flex gap-2">
                  <dt className="text-neutral-500">{group.title}</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(sub.cents)}</dd>
                </div>
              );
            })}
          </dl>
        )}
        <p className="mt-3 text-xs text-neutral-400">在每一款的“库存与排期”里给每件填采购价；只有后台能看到。</p>
      </section>

      {groups.map((group) => {
        const list = styles.filter((x) => styleKind(x.category) === group.kind);
        if (list.length === 0) return null;
        const ids = new Set(list.map((x) => x.id));
        const groupCost = costSummary(allItems.filter((i) => ids.has(i.item.style_id)));
        return (
          <section key={group.kind} className="mt-10">
            <h2 className="text-lg font-bold">
              {group.title}{" "}
              <span className="text-sm font-normal text-neutral-500">
                {list.length} 款 · 成本 {formatMoney(groupCost.cents)}
              </span>
            </h2>
            <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
              {list.map((style) => {
                const items = inventory.get(style.id) ?? [];
                const styleCost = costSummary(items);
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
                          {style.tier && <TierBadge tier={style.tier} locale="zh" />}
                          {!style.is_active && <span className="text-xs text-red-600">已下架</span>}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {[style.brand, messages.categories[style.category]].filter(Boolean).join(" · ")} · 起租{" "}
                          {formatMoney(stylePriceTable(style, tables)[0], { whole: true })} · 押金{" "}
                          {formatMoney(style.deposit_cents, { whole: true })}
                          {style.rental_prices_cents && style.category !== "helmet_cover" && style.category !== "gloves"
                            ? " · 单独定价"
                            : ""}
                          {items.length > 0 &&
                            (styleCost.priced === 0
                              ? " · 采购价未填"
                              : ` · 成本 ${formatMoney(styleCost.cents)}${styleCost.missing ? `（${styleCost.missing} 件未填）` : ""}`)}
                        </p>
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {items.map((i) => (
                            <span key={i.item.id} className="inline-flex items-center gap-1">
                              {/* 头盔套都是均码，显示编号区分 */}
                              <span className={style.category === "helmet_cover" ? "font-mono text-neutral-500" : "text-neutral-500"}>
                                {style.category === "helmet_cover" ? i.item.code : i.item.size}
                              </span>
                              <ItemStateBadge state={i.state} />
                            </span>
                          ))}
                          {items.length === 0 &&
                            (style.bundle_style_ids ? (
                              <span className="text-neutral-500">整套（库存在单品上）</span>
                            ) : (
                              <span className="text-red-600">没有库存</span>
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
          </section>
        );
      })}
      <p className="mt-6 text-xs text-neutral-500">{messages.admin.itemStatesHint}</p>
      {!only && (
        <p className="mt-2 text-xs text-neutral-500">
          新增款式：在“雪服”“手套”“头盔套”页面右上角点“+ 新增”。
        </p>
      )}
    </>
  );
}

/** 采购价合计：没填采购价的件不算进去，单独数出来 */
function costSummary(items: ItemOverview[]) {
  const priced = items.filter((i) => i.item.purchase_cents !== null);
  return {
    cents: priced.reduce((sum, i) => sum + (i.item.purchase_cents ?? 0), 0),
    priced: priced.length,
    missing: items.length - priced.length,
  };
}
