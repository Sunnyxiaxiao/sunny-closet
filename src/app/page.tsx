import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ProductCard, ProductGridSkeleton } from "@/components/product-card";
import { StyleImage } from "@/components/style-image";
import { shop } from "@/config/shop";
import { getAvailability, listStyles } from "@/lib/catalog";
import { STYLE_CATEGORIES } from "@/lib/categories";
import { messages } from "@/messages/zh-CN";

const t = messages.home;

export default function HomePage() {
  return (
    <div>
      <section className="relative h-[78svh] min-h-[460px] w-full overflow-hidden bg-neutral-800">
        <Image src={shop.heroImage} alt="" fill priority unoptimized sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-5 pb-12 sm:pb-16">
          <h1 className="whitespace-pre-line text-4xl font-black leading-tight text-white sm:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/85 sm:text-base">{t.heroSubtitle}</p>
          <Link
            href="/styles"
            className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-bold tracking-widest text-neutral-900 transition hover:bg-neutral-200"
          >
            {t.browseCta}
          </Link>
        </div>
      </section>

      <Suspense
        fallback={
          <section className="mx-auto max-w-7xl px-2 py-12 sm:px-4">
            <ProductGridSkeleton count={4} />
          </section>
        }
      >
        <HomeCatalog />
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

async function HomeCatalog() {
  const [styles, availability] = await Promise.all([listStyles(), getAvailability()]);
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
                <Link href={`/styles?category=${category}`} className="group relative block">
                  <StyleImage
                    src={cover?.image_urls[0]}
                    alt={messages.categories[category]}
                    sizes="(min-width: 640px) 25vw, 42vw"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-10 text-base font-bold text-white">
                    {messages.categories[category]} →
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
          <Link href="/styles" className="text-sm underline underline-offset-4">
            {t.viewAll}
          </Link>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {newArrivals.map((style) => (
            <li key={style.id}>
              <ProductCard
                style={style}
                sizes={(availability.get(style.id) ?? []).map((s) => s.size)}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
