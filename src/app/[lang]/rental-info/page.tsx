import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";

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
