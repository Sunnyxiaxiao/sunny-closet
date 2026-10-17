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
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold">联系我们</h1>
      <p className="mt-2 text-slate-600">（占位文字）有任何问题，欢迎通过以下方式联系我们。</p>
      <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-6">
            <dt className="w-20 shrink-0 text-sm text-slate-500">{item.label}</dt>
            <dd className="text-slate-800">
              {item.href ? (
                <a href={item.href} className="text-brand-700 hover:underline">
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
