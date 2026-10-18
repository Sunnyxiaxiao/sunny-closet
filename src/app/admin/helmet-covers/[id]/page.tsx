import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addHelmetCoverItem } from "@/app/admin/helmet-covers/actions";
import { AdminHelmetCoverForm, type HelmetCoverFormValues } from "@/components/admin-helmet-cover-form";
import { AdminItemCard } from "@/components/admin-item-card";
import { shop } from "@/config/shop";
import { requireAdmin } from "@/lib/admin/auth";
import { loadInventory } from "@/lib/admin/inventory";
import { todayIn } from "@/lib/dates";
import { HELMET_COVER_CATEGORY, standalonePricesFrom } from "@/lib/helmet-covers";

export default function EditHelmetCoverPage({ params, searchParams }: PageProps<"/admin/helmet-covers/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/admin/helmet-covers" className="text-sm underline underline-offset-4">
        ← 头盔套
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse bg-neutral-100" />}>
        <EditHelmetCover params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EditHelmetCover({ params, searchParams }: PageProps<"/admin/helmet-covers/[id]">) {
  const { supabase } = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: cover, error } = await supabase
    .from("styles")
    .select("*")
    .eq("id", id)
    .eq("category", HELMET_COVER_CATEGORY)
    .maybeSingle();
  if (error) throw new Error(`读取头盔套失败：${error.message}`);
  if (!cover || !cover.tier) notFound();

  const today = todayIn(shop.timeZone);
  const items = (await loadInventory(supabase, [cover.id], today)).get(cover.id) ?? [];
  const prices = standalonePricesFrom(cover.rental_prices_cents ?? [0]);
  const dollars = (cents: number) => String(cents / 100);

  const initial: HelmetCoverFormValues = {
    id: cover.id,
    name: cover.name,
    nameEn: cover.name_en,
    slug: cover.slug,
    description: cover.description,
    descriptionEn: cover.description_en,
    tier: cover.tier,
    tags: cover.tags.join(", "),
    oneDay: dollars(prices.oneDay),
    twoToThreeDays: dollars(prices.twoToThreeDays),
    fourToSevenDays: dollars(prices.fourToSevenDays),
    addOn: dollars(cover.addon_price_cents ?? 0),
    replacementValue: cover.replacement_value_cents === null ? "" : dollars(cover.replacement_value_cents),
    deposit: dollars(cover.deposit_cents),
    sortOrder: String(cover.sort_order),
    isActive: cover.is_active,
    imageUrls: cover.image_urls,
  };

  const blockError = typeof query.blockError === "string" ? query.blockError : null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">{cover.name}</h1>
        {cover.is_active && (
          <Link href={`/helmet-covers/${cover.slug}`} className="text-sm underline underline-offset-4">
            查看前台页面 ↗
          </Link>
        )}
      </div>
      {query.saved && <p className="mt-3 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">已保存。</p>}

      <section id="items" className="mt-8 scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">库存与排期</h2>
          <form action={addHelmetCoverItem}>
            <input type="hidden" name="styleId" value={cover.id} />
            <button type="submit" className="text-sm underline underline-offset-4">
              + 再加一件
            </button>
          </form>
        </div>
        {blockError && <p className="mt-3 bg-red-50 px-4 py-2 text-sm text-red-800">{blockError}</p>}
        <ul className="mt-3 space-y-4">
          {items.map((overview) => (
            <AdminItemCard
              key={overview.item.id}
              overview={overview}
              today={today}
              returnTo={`/admin/helmet-covers/${cover.id}`}
            />
          ))}
        </ul>
      </section>

      <section className="mt-10 border-t border-neutral-200 pt-8">
        <h2 className="mb-6 text-lg font-bold">商品信息</h2>
        <AdminHelmetCoverForm initial={initial} />
      </section>
    </>
  );
}
