import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BookingPanel } from "@/components/booking-panel";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { getAvailability, getSettings, getStyleBySlug, getToday, listStyles } from "@/lib/catalog";
import { parseDescription, type DescriptionBlock } from "@/lib/description";
import { formatMoney } from "@/lib/money";
import { rentalSearchParamsSchema } from "@/lib/validation/rental-query";
import { messages } from "@/messages/zh-CN";

const t = messages.product;

export default function StyleDetailPage({ params, searchParams }: PageProps<"/styles/[slug]">) {
  return (
    <div className="mx-auto max-w-7xl md:px-4 md:py-8">
      <Suspense fallback={<DetailSkeleton />}>
        <StyleDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StyleDetail({ params, searchParams }: PageProps<"/styles/[slug]">) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const style = await getStyleBySlug(slug);
  if (!style) notFound();

  const [settings, today, availability, allStyles] = await Promise.all([
    getSettings(),
    getToday(),
    getAvailability(),
    listStyles(),
  ]);
  const sizes = availability.get(style.id) ?? [];
  const initial = rentalSearchParamsSchema.parse(raw);
  const related = allStyles
    .filter((s) => s.id !== style.id)
    .sort((a, b) => Number(b.category === style.category) - Number(a.category === style.category))
    .slice(0, 4);

  return (
    <>
      <div className="md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12">
        <ProductGallery images={style.image_urls} alt={style.name} />

        <div className="px-4 pt-5 md:sticky md:top-24 md:self-start md:px-0 md:pt-0">
          <nav className="text-xs text-neutral-500">
            <Link href="/styles" className="hover:underline">
              {messages.nav.styles}
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={`/styles?category=${style.category}`} className="hover:underline">
              {messages.categories[style.category]}
            </Link>
          </nav>
          {style.brand && (
            <p className="mt-3 text-xs uppercase tracking-widest text-neutral-500">{style.brand}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold leading-snug sm:text-3xl">{style.name}</h1>
          <p className="mt-3 text-xl">
            <span className="font-bold">{formatMoney(style.daily_price_cents)}</span>
            <span className="text-base text-neutral-500"> {t.perDay}</span>
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {t.deposit} {formatMoney(style.deposit_cents)}（归还后退还）
          </p>

          <div className="mt-6 border-t border-neutral-200 pt-6">
            {sizes.length === 0 ? (
              <p className="text-neutral-500">这套雪服暂时不可租。</p>
            ) : (
              <BookingPanel
                styleId={style.id}
                dailyPriceCents={style.daily_price_cents}
                depositCents={style.deposit_cents}
                sizes={sizes}
                today={today}
                maxRentalDays={settings.maxRentalDays}
                bufferDays={settings.bufferDays}
                initial={initial}
              />
            )}
          </div>

          <div className="mt-8 border-t border-neutral-200">
            {parseDescription(style.description).map((section, index) => (
              <Accordion key={index} title={section.title ?? t.description} defaultOpen={index === 0}>
                <DescriptionBlocks blocks={section.blocks} />
              </Accordion>
            ))}
            <Accordion title={t.rentalNotes}>
              <ul className="list-disc space-y-1 pl-5">
                {t.rentalNotesBody.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Link href="/rental-info" className="mt-2 inline-block underline underline-offset-4">
                查看完整租赁须知
              </Link>
            </Accordion>
            <Accordion title={t.questions}>
              <p>{t.questionsBody}</p>
              <Link href="/contact" className="mt-2 inline-block underline underline-offset-4">
                {messages.nav.contact}
              </Link>
            </Accordion>
          </div>

          {style.source_url && (
            <p className="mt-4 text-xs text-neutral-400">
              {t.sourceCredit}
              <a
                href={style.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:text-neutral-600"
              >
                {style.brand || new URL(style.source_url).hostname} {t.officialSite}
              </a>
            </p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="px-2 pt-14 md:px-0">
          <h2 className="px-2 text-xl font-black md:px-0">{t.related}</h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-4 sm:gap-x-4">
            {related.map((s) => (
              <li key={s.id}>
                <ProductCard style={s} sizes={(availability.get(s.id) ?? []).map((x) => x.size)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DescriptionBlocks({ blocks }: { blocks: DescriptionBlock[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-neutral-200" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold">
        {title}
        <span className="text-lg leading-none transition group-open:rotate-45">+</span>
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-neutral-700">{children}</div>
    </details>
  );
}

function DetailSkeleton() {
  return (
    <div className="md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12" aria-busy="true">
      <div className="aspect-[3/5] animate-pulse bg-neutral-100" />
      <div className="space-y-3 px-4 pt-5 md:px-0 md:pt-0">
        <div className="h-8 w-2/3 animate-pulse bg-neutral-100" />
        <div className="h-6 w-1/3 animate-pulse bg-neutral-100" />
        <div className="h-64 animate-pulse bg-neutral-100" />
      </div>
    </div>
  );
}
