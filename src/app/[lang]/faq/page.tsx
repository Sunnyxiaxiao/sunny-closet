import type { Metadata } from "next";
import Link from "@/components/storefront-link";
import { Suspense } from "react";
import { localePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getSettings } from "@/lib/catalog";
import { termsArgs, type TermsBlock } from "@/lib/terms";
import { pageSeo } from "@/lib/seo";
import { getMessages, type Messages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = getMessages(locale).faq.title;
  return { title, ...pageSeo(locale, "/faq", { title }) };
}

export default async function FaqPage() {
  const locale = await getLocale();
  const t = getMessages(locale).faq;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">{t.heading}</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse bg-neutral-100" />}>
        <Groups t={t} />
      </Suspense>
      <section className="mt-10 bg-neutral-50 p-5">
        <h2 className="font-bold">{t.moreTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">{t.moreBody}</p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href={localePath(locale, "/contact")} className="underline underline-offset-2">
            {t.contactLink}
          </Link>
          <Link href={localePath(locale, "/terms")} className="underline underline-offset-2">
            {t.termsLink}
          </Link>
        </p>
      </section>
    </div>
  );
}

/** The answers quote the shortest shipped rental, an admin setting read at request time */
async function Groups({ t }: { t: Messages["faq"] }) {
  const settings = await getSettings();
  return (
    <>
      {t.groups(termsArgs(settings.shippingMinDays)).map((group) => (
        <section key={group.title} className="mt-10">
          <h2 className="text-lg font-black">{group.title}</h2>
          <div className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
            {group.items.map((item) => (
              <div key={item.q} className="py-5">
                <h3 className="font-bold">{item.q}</h3>
                {item.a.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Block({ block }: { block: TermsBlock }) {
  if (typeof block === "string") {
    return <p className="mt-2 text-sm leading-relaxed text-neutral-700">{block}</p>;
  }
  if ("list" in block) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-700">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return null;
}
