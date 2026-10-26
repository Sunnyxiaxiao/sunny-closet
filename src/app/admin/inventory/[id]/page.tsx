import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { addInventoryItem } from "@/app/admin/inventory/actions";
import { AdminItemCard } from "@/components/admin-item-card";
import { AdminStyleForm } from "@/components/admin-style-form";
import { AdminStyleImages } from "@/components/admin-style-images";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory } from "@/lib/admin/inventory";
import { centsToDollars } from "@/lib/admin/price-form";
import { styleKind } from "@/lib/catalog";
import { todayIn } from "@/lib/dates";
import { messages } from "@/messages/zh-CN";

const STOREFRONT_PATH = { outfit: "/styles", gloves: "/gloves", helmet_cover: "/helmet-covers" } as const;

export default function AdminStylePage({ params, searchParams }: PageProps<"/admin/inventory/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
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
  // 头盔套有自己的编辑页（档位、加购价）
  if (style.category === "helmet_cover") redirect(`/admin/helmet-covers/${style.id}`);
  const gloves = style.category === "gloves";

  const today = todayIn(shop.timeZone);
  const items = (await loadInventory(supabase, [style.id], today)).get(style.id) ?? [];
  const returnTo = `/admin/inventory/${style.id}`;
  const itemError = typeof query.itemError === "string" ? query.itemError : null;
  const blockError = typeof query.blockError === "string" ? query.blockError : null;
  const costError = typeof query.costError === "string" ? query.costError : null;
  const parts = style.bundle_style_ids ? await loadParts(supabase, style.bundle_style_ids) : null;
  const storefront = `${STOREFRONT_PATH[styleKind(style.category)]}/${style.slug}`;

  return (
    <>
      <Link href={gloves ? "/admin/gloves" : "/admin/outfits"} className="text-sm underline underline-offset-4">
        ← {gloves ? "手套" : "雪服"}
      </Link>
      {query.created && (
        <p className="mt-4 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          已新增{style.is_active ? "并上架" : "（还没上架）"}。可以在下面继续加其他尺码 / 颜色的库存、调整图片顺序。
        </p>
      )}
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
        <h2 className="mb-4 text-lg font-bold">商品信息</h2>
        <AdminStyleForm
          initial={{
            id: style.id,
            kind: gloves ? "gloves" : "outfit",
            brand: style.brand,
            category: style.category,
            name: style.name,
            nameEn: style.name_en,
            deposit: centsToDollars(style.deposit_cents),
            prices: style.rental_prices_cents?.map(centsToDollars).join(", ") ?? "",
            replacementValue:
              style.replacement_value_cents === null ? "" : centsToDollars(style.replacement_value_cents),
            sortOrder: String(style.sort_order),
            description: style.description,
            descriptionEn: style.description_en,
            tags: style.tags,
            isActive: style.is_active,
          }}
        />
      </section>

      <section id="images" className="mt-10 scroll-mt-24 border-t border-neutral-200 pt-8">
        <h2 className="mb-4 text-lg font-bold">
          图片 <span className="text-sm font-normal text-neutral-500">{style.image_urls.length} 张</span>
        </h2>
        <AdminStyleImages id={style.id} slug={style.slug} initial={style.image_urls} />
      </section>

      <section id="items" className="mt-10 scroll-mt-24 border-t border-neutral-200 pt-8">
        <h2 className="text-lg font-bold">库存与排期</h2>
        {parts ? (
          <p className="mt-3 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
            这是店主搭配的整套，没有自己的库存：库存、排期和采购价都在里面的单品上（
            {parts.map((part, i) => (
              <span key={part.id}>
                {i > 0 && "、"}
                <Link href={`/admin/inventory/${part.id}`} className="underline underline-offset-4">
                  {part.name}
                </Link>
              </span>
            ))}
            ）。顾客租整套时，这几件会一起被占用。
          </p>
        ) : (
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
            <label className="flex flex-col text-xs text-neutral-500">
              采购价（美元，选填）
              <input
                name="cost"
                inputMode="decimal"
                className="h-10 w-28 border border-neutral-300 bg-white px-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
            </label>
            <button type="submit" className="h-10 rounded-full bg-neutral-900 px-4 text-xs font-bold text-white hover:bg-neutral-700">
              + 加一件
            </button>
          </form>
        )}
        {itemError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{itemError}</p>}
        {blockError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{blockError}</p>}
        {costError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{costError}</p>}
        {items.length === 0 ? (
          !parts && <p className="mt-4 text-sm text-neutral-500">还没有库存，顾客订不了。先加一件。</p>
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

/** 整套的单品（按套装里的顺序） */
async function loadParts(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], ids: string[]) {
  const { data, error } = await supabase.from("styles").select("id, name").in("id", ids);
  if (error) throw new Error(`读取套装单品失败：${error.message}`);
  return ids.flatMap((id) => data.filter((x) => x.id === id));
}
