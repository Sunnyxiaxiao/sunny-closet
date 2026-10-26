import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { getSettings } from "@/lib/catalog";
import { shippingPolicyArgs } from "@/lib/shipping";
import { getMessages, type Messages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).rentalInfo.title };
}

export default async function RentalInfoPage() {
  const t = getMessages(await getLocale()).rentalInfo;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">{t.title}</h1>
      <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        <section className="py-5">
          <h2 className="font-bold">{t.daysTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">{t.daysIntro}</p>
          {t.methods.map((m) => (
            <div key={m.title} className="mt-3">
              <h3 className="text-sm font-semibold">{m.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-700">{m.body}</p>
            </div>
          ))}
          <div className="mt-4 bg-neutral-50 p-4 text-sm">
            <p className="font-semibold">{t.exampleTitle}</p>
            <dl className="mt-2 space-y-1">
              {t.example.map(([day, what]) => (
                <div key={day} className="flex gap-3">
                  <dt className="w-32 shrink-0 text-neutral-500">{day}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 font-bold">{t.exampleResult}</p>
          </div>
        </section>
        <section className="py-5">
          <h2 className="font-bold">{t.shippingTitle}</h2>
          <Suspense fallback={<div className="mt-2 h-24 animate-pulse bg-neutral-100" />}>
            <ShippingRules t={t} />
          </Suspense>
        </section>
        {t.sections.map((s) => (
          <section key={s.title} className="py-5">
            <h2 className="font-bold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

/** 邮寄与自取：邮寄最短天数来自后台设置，提前几天下单来自 src/config/shop.ts */
async function ShippingRules({ t }: { t: Messages["rentalInfo"] }) {
  const settings = await getSettings();
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-700">
      {t.shippingRules(...shippingPolicyArgs(settings.shippingMinDays)).map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ul>
  );
}
