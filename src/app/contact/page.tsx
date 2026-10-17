import type { Metadata } from "next";
import { shop } from "@/config/shop";

export const metadata: Metadata = { title: "联系我们" };

export default function ContactPage() {
  const items = [
    { label: "邮箱", value: shop.contact.email, href: `mailto:${shop.contact.email}` },
    { label: "电话", value: shop.contact.phone, href: `tel:${shop.contact.phone.replace(/[^\d+]/g, "")}` },
    { label: "地址", value: shop.contact.address },
    { label: "营业时间", value: shop.contact.hours },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">联系我们</h1>
      <p className="mt-2 text-sm text-neutral-600">（占位文字）有任何问题，欢迎通过以下方式联系我们。</p>
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
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
