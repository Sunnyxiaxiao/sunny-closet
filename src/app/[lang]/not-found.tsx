import Link from "next/link";
import { localePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";

export default async function NotFound() {
  const locale = await getLocale();
  const t = getMessages(locale).notFound;
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-5xl font-black">404</p>
      <h1 className="mt-4 text-lg font-semibold">{t.title}</h1>
      <p className="mt-2 text-sm text-neutral-600">{t.body}</p>
      <Link
        href={localePath(locale, "/styles")}
        className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-8 text-sm font-bold tracking-wider text-white hover:bg-neutral-700"
      >
        {t.cta}
      </Link>
    </div>
  );
}
