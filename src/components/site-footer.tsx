import Link from "next/link";
import { shop } from "@/config/shop";
import { STYLE_CATEGORIES } from "@/lib/categories";
import { messages } from "@/messages/zh-CN";
import { navLinks } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-neutral-900 text-neutral-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm sm:grid-cols-3">
        <div>
          <p className="text-base font-black uppercase tracking-[0.2em] text-white">{shop.name}</p>
          <p className="mt-3">{shop.tagline}</p>
          <p className="mt-3">
            {shop.contact.email}
            <br />
            {shop.contact.phone}
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">{messages.footer.shop}</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/styles" className="hover:text-white">
                {messages.nav.styles}
              </Link>
            </li>
            {STYLE_CATEGORIES.map((c) => (
              <li key={c}>
                <Link href={`/styles?category=${c}`} className="hover:text-white">
                  {messages.categories[c]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">{messages.footer.help}</p>
          <ul className="mt-3 space-y-2">
            {navLinks.slice(1).map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-neutral-800 px-4 py-5 text-center text-xs text-neutral-500">
        © {shop.name}. {messages.footer.rights}
      </p>
    </footer>
  );
}
