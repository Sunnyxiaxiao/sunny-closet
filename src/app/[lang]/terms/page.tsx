import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getSettings } from "@/lib/catalog";
import { termsArgs, type TermsBlock } from "@/lib/terms";
import { pageSeo } from "@/lib/seo";
import { getMessages, type Messages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = getMessages(locale).terms.title;
  return { title, ...pageSeo(locale, "/terms", { title }) };
}

export default async function TermsPage() {
  const t = getMessages(await getLocale()).terms;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">{t.title}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t.updated}</p>
      <p className="mt-6 text-sm leading-relaxed text-neutral-700">{t.intro}</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse bg-neutral-100" />}>
        <Sections t={t} />
      </Suspense>
    </div>
  );
}

/** The sections quote the shortest shipped rental, an admin setting read at request time */
async function Sections({ t }: { t: Messages["terms"] }) {
  const settings = await getSettings();
  return (
    <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
      {t.sections(termsArgs(settings.shippingMinDays)).map((s, i) => (
        <section key={s.title} className="py-5">
          <h2 className="font-bold">
            {i + 1}. {s.title}
          </h2>
          {s.blocks.map((block, j) => (
            <Block key={j} block={block} />
          ))}
        </section>
      ))}
    </div>
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
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-300">
            {block.table.head.map((h) => (
              <th key={h} className="py-2 pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-neutral-700">
          {block.table.rows.map((row) => (
            <tr key={row[0]} className="border-b border-neutral-100 align-top">
              {row.map((cell, k) => (
                <td key={k} className="py-2 pr-4 leading-relaxed">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
