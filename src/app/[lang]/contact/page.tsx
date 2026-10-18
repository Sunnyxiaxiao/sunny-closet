import type { Metadata } from "next";
import { shop } from "@/config/shop";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).contact.title };
}

export default async function ContactPage() {
  const t = getMessages(await getLocale()).contact;
  const items = [
    { label: t.email, value: shop.contact.email, href: `mailto:${shop.contact.email}` },
    {
      label: t.phone,
      value: shop.contact.phone,
      // 只收短信：手机上点了直接打开短信
      href: `sms:+1${shop.contact.phone.replace(/\D/g, "")}`,
      note: t.textOnly,
    },
    { label: t.address, value: t.addressValue },
    { label: t.hours, value: t.hoursValue },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">{t.title}</h1>
      <p className="mt-2 text-sm text-neutral-600">{t.intro}</p>
      <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6">
            <dt className="w-20 shrink-0 text-sm text-neutral-500">{item.label}</dt>
            <dd>
              {item.href ? (
                <a href={item.href} className="underline underline-offset-4">
                  {item.value}
                </a>
              ) : (
                item.value
              )}
              {"note" in item && <span className="text-sm text-neutral-500">{item.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
