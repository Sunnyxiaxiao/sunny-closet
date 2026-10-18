"use client";

import { useParams } from "next/navigation";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/messages";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const t = getMessages(isLocale(lang) ? lang : DEFAULT_LOCALE).errorPage;
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <p className="mt-2 text-sm text-neutral-600">{t.body}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
      >
        {t.retry}
      </button>
    </div>
  );
}
