import Link from "next/link";
import { messages } from "@/messages/zh-CN";

export default function HomePage() {
  const t = messages.home;
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-100 to-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <h1 className="text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{t.heroTitle}</h1>
          <p className="mt-3 max-w-xl text-base text-slate-600 sm:text-lg">{t.heroSubtitle}</p>
          <Link
            href="/styles"
            className="mt-6 inline-flex h-12 items-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {t.browseCta}
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-xl font-semibold">{t.stepsTitle}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {t.steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm font-semibold text-brand-600">0{index + 1}</span>
              <p className="mt-1 font-medium">{step.title}</p>
              <p className="mt-1 text-sm text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
