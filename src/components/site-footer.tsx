import { shop } from "@/config/shop";
import { messages } from "@/messages/zh-CN";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl space-y-1 px-4 py-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">{shop.name}</p>
        <p>
          {shop.contact.email} · {shop.contact.phone}
        </p>
        <p>© {shop.name}. {messages.footer.rights}</p>
      </div>
    </footer>
  );
}
