import Link from "next/link";
import { shop } from "@/config/shop";
import { messages } from "@/messages/zh-CN";

const links = [
  { href: "/styles", label: messages.nav.styles },
  { href: "/rental-info", label: messages.nav.rentalInfo },
  { href: "/contact", label: messages.nav.contact },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-700">
          ❄ {shop.name}
        </Link>
        <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
