import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addInventoryItem } from "@/app/admin/inventory/actions";
import { AdminItemCard } from "@/components/admin-item-card";
import { AdminStyleForm } from "@/components/admin-style-form";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory } from "@/lib/admin/inventory";
import { centsToDollars } from "@/lib/admin/price-form";
import { styleKind } from "@/lib/catalog";
import { todayIn } from "@/lib/dates";
import { messages } from "@/messages/zh-CN";

const STOREFRONT_PATH = { outfit: "/styles", gloves: "/gloves", helmet_cover: "/helmet-covers" } as const;

const CATEGORY_PRICES_HINT: Record<string, string> = {
  jacket: "按全店“只租外套”价目表",
  pants: "按全店“只租雪裤”价目表",
  gloves: "手套必须填自己的价目表",
  helmet_cover: "头盔套必须填自己的价目表",
};

export default function AdminStylePage({ params, searchParams }: PageProps<"/admin/inventory/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/admin/inventory" className="text-sm underline underline-offset-4">
        ← 库存
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse bg-neutral-100" />}>
        <StyleEditor params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StyleEditor({ params, searchParams }: PageProps<"/admin/inventory/[id]">) {
  const { supabase } = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: style, error } = await supabase.from("styles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`读取款式失败：${error.message}`);
  if (!style) notFound();

  const today = todayIn(shop.timeZone);
  const items = (await loadInventory(supabase, [style.id], today)).get(style.id) ?? [];
  const returnTo = `/admin/inventory/${style.id}`;
  const itemError = typeof query.itemError === "string" ? query.itemError : null;
  const blockError = typeof query.blockError === "string" ? query.blockError : null;
  const storefront = `${STOREFRONT_PATH[styleKind(style.category)]}/${style.slug}`;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{style.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {[style.brand, messages.categories[style.category]].filter(Boolean).join(" · ")}
          </p>
        </div>
        {style.is_active && (
          <Link href={storefront} className="text-sm underline underline-offset-4">
            查看前台页面 ↗
          </Link>
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-bold">价格与上下架</h2>
        <AdminStyleForm
          initial={{
            id: style.id,
            name: style.name,
            nameEn: style.name_en,
            deposit: centsToDollars(style.deposit_cents),
            prices: style.rental_prices_cents?.map(centsToDollars).join(", ") ?? "",
            sortOrder: String(style.sort_order),
            isActive: style.is_active,
          }}
          categoryPricesHint={CATEGORY_PRICES_HINT[style.category] ?? "按全店“完整套装”价目表（在“价格”里改）"}
        />
      </section>

      <section id="items" className="mt-10 scroll-mt-24 border-t border-neutral-200 pt-8">
        <h2 className="text-lg font-bold">库存与排期</h2>
        <form action={addInventoryItem} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="styleId" value={style.id} />
          <label className="flex flex-col text-xs text-neutral-500">
            尺码 / 颜色
            <input
              name="size"
              required
              maxLength={20}
              placeholder="例如 M、芭蕾粉 · S"
              className="h-10 border border-neutral-300 bg-white px-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-500">
            编号（选填）
            <input
              name="code"
              maxLength={40}
              placeholder="不填自动生成"
              className="h-10 border border-neutral-300 bg-white px-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </label>
          <button type="submit" className="h-10 rounded-full bg-neutral-900 px-4 text-xs font-bold text-white hover:bg-neutral-700">
            + 加一件
          </button>
        </form>
        {itemError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{itemError}</p>}
        {blockError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{blockError}</p>}
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">还没有库存，顾客订不了。先加一件。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {items.map((overview) => (
              <AdminItemCard key={overview.item.id} overview={overview} today={today} returnTo={returnTo} />
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          英文页面的颜色名在 src/messages/en.ts 的 sizeNames 里翻译（例如“芭蕾粉 · S”显示成 Ballet Pink · S）；新的中文颜色名告诉我加上英文。
        </p>
      </section>
    </>
  );
}
