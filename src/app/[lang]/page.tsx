import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { HelmetCoverCard } from "@/components/helmet-cover-card";
import { ProductCard, ProductGridSkeleton } from "@/components/product-card";
import { StyleImage } from "@/components/style-image";
import { shop } from "@/config/shop";
import { localePath, type Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getAvailability, getSettings, listStyles, stylePriceTable } from "@/lib/catalog";
import { STYLE_CATEGORIES } from "@/lib/categories";
import { getMessages } from "@/messages";

export default async function HomePage() {
  const locale = await getLocale();
  const t = getMessages(locale).home;
  return (
    <div>
      <section className="relative bg-neutral-950 text-white">
        {/*
          大图按原比例显示：屏幕够宽（约 1400px 以上）时整张铺满；更窄时保持最低高度放得下文字，
          左右滑动看全图。文字叠在图上，pointer-events-none 让手指在文字上也能滑动图片。
        */}
        <div className="no-scrollbar overflow-x-auto">
          <Image
            src={shop.heroImage.src}
            width={shop.heroImage.width}
            height={shop.heroImage.height}
            alt=""
            priority
            unoptimized
            sizes="100vw"
            className="block h-[max(18rem,20.85vw)] w-auto min-w-full max-w-none object-cover"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/30 sm:bg-transparent bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.25)_45%,transparent_75%)] px-5 text-center [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
          {/* 第一次来的人一眼看出这是租赁，不是卖衣服 */}
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90 sm:text-xs">{t.heroEyebrow}</p>
          <h1 className="mt-2 whitespace-pre-line text-2xl font-black leading-tight sm:text-4xl xl:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-2 max-w-md text-xs text-white/90 sm:text-sm">{t.heroSubtitle}</p>
          <Link
            href={localePath(locale, "/styles")}
            className="pointer-events-auto mt-4 inline-flex h-10 items-center rounded-full bg-white/90 px-7 text-sm font-bold tracking-widest text-neutral-900 [text-shadow:none] transition hover:bg-white sm:h-11"
          >
            {t.browseCta}
          </Link>
          <p className="absolute inset-x-0 bottom-2 text-[11px] text-white/70 min-[1400px]:hidden">{t.heroSwipe}</p>
        </div>
      </section>

      <Suspense
        fallback={
          <section className="mx-auto max-w-7xl px-2 py-12 sm:px-4">
            <ProductGridSkeleton count={4} />
          </section>
        }
      >
        <HomeCatalog locale={locale} />
      </Suspense>

      <Suspense fallback={null}>
        <HelmetSpotlight locale={locale} />
      </Suspense>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-center text-2xl font-black">{t.stepsTitle}</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {t.steps.map((step, index) => (
            <li key={step.title} className="text-center">
              <span className="text-3xl font-black text-neutral-300">0{index + 1}</span>
              <p className="mt-2 font-bold">{step.title}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-neutral-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** 首页的头盔套推荐：没有上架的头盔套时整块不显示 */
async function HelmetSpotlight({ locale }: { locale: Locale }) {
  const t = getMessages(locale).home;
  const covers = (await listStyles({ kind: "helmet_cover", locale })).slice(0, 6);
  if (covers.length === 0) return null;

  return (
    <section className="bg-rose-50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl sm:px-4">
        <div className="px-4 sm:flex sm:items-end sm:justify-between sm:gap-8 sm:px-0">
          <div>
            <h2 className="text-3xl font-black sm:text-4xl">{t.helmetTitle}</h2>
            <p className="mt-2 max-w-md text-sm text-neutral-700 sm:text-base">{t.helmetBody}</p>
          </div>
          <Link
            href={localePath(locale, "/helmet-covers")}
            className="mt-5 hidden h-12 shrink-0 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-widest text-white transition hover:bg-neutral-700 sm:inline-flex"
          >
            {t.helmetCta}
          </Link>
        </div>
        <ul className="no-scrollbar mt-6 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
          {covers.map((cover) => (
            <li key={cover.id} className="w-[44%] shrink-0 snap-start sm:w-auto">
              <HelmetCoverCard
                cover={cover}
                sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 44vw"
                locale={locale}
              />
            </li>
          ))}
        </ul>
        <div className="mt-6 px-4 sm:hidden">
          <Link
            href={localePath(locale, "/helmet-covers")}
            className="flex h-12 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-widest text-white"
          >
            {t.helmetCta}
          </Link>
        </div>
      </div>
    </section>
  );
}

async function HomeCatalog({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.home;
  const [styles, availability, settings] = await Promise.all([
    listStyles({ locale }),
    getAvailability(),
    getSettings(),
  ]);
  const categories = STYLE_CATEGORIES.map((category) => ({
    category,
    cover: styles.find((s) => s.category === category),
  })).filter((c) => c.cover);
  const newArrivals = styles.slice(0, 8);

  return (
    <>
      {categories.length > 1 && (
        <section className="mx-auto max-w-7xl pt-12 sm:px-4">
          <h2 className="px-4 text-2xl font-black sm:px-0">{t.categoriesTitle}</h2>
          <ul className="no-scrollbar mt-5 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0">
            {categories.map(({ category, cover }) => (
              <li key={category} className="w-[42%] shrink-0 snap-start sm:w-auto">
                <Link href={localePath(locale, `/styles?category=${category}`)} className="group relative block">
                  <StyleImage
                    src={cover?.image_urls[0]}
                    alt={messages.categories[category]}
                    sizes="(min-width: 640px) 25vw, 42vw"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-10 text-base font-bold text-white">
                    {t.categoryLink(messages.categories[category])}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-2 py-12 sm:px-4">
        <div className="flex items-end justify-between px-2 sm:px-0">
          <h2 className="text-2xl font-black">{t.newArrivalsTitle}</h2>
          <Link href={localePath(locale, "/styles")} className="text-sm underline underline-offset-4">
            {t.viewAll}
          </Link>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {newArrivals.map((style) => (
            <li key={style.id}>
              <ProductCard
                style={style}
                fromCents={stylePriceTable(style, settings)[0]}
                sizes={(availability.get(style.id) ?? []).map((s) => s.size)}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
