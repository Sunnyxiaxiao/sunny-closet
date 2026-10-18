import Link from "next/link";
import { shop } from "@/config/shop";
import { localePath, type Locale } from "@/i18n/config";
import { STYLE_CATEGORIES } from "@/lib/categories";
import { getMessages } from "@/messages";
import { navLinks } from "./site-header";

export function SiteFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const href = (path: string) => localePath(locale, path);
  return (
    <footer className="mt-16 bg-neutral-900 text-neutral-300">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm sm:grid-cols-3">
        <div>
          <p translate="no" className="notranslate text-base font-black uppercase tracking-[0.2em] text-white">
            {shop.name}
          </p>
          <p className="mt-3">{messages.footer.tagline}</p>
          <p className="mt-3">
            {shop.contact.email}
            <br />
            {shop.contact.phone} · {messages.footer.textOnly}
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">{messages.footer.shop}</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href={href("/styles")} className="hover:text-white">
                {messages.nav.styles}
              </Link>
            </li>
            {STYLE_CATEGORIES.map((c) => (
              <li key={c}>
                <Link href={href(`/styles?category=${c}`)} className="hover:text-white">
                  {messages.categories[c]}
                </Link>
              </li>
            ))}
            <li>
              <Link href={href("/helmet-covers")} className="hover:text-white">
                {messages.nav.helmetCovers}
              </Link>
            </li>
            <li>
              <Link href={href("/gloves")} className="hover:text-white">
                {messages.nav.gloves}
              </Link>
            </li>
            <li>
              <Link href={href("/mix-and-match")} className="hover:text-white">
                {messages.nav.mixMatch}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">{messages.footer.help}</p>
          <ul className="mt-3 space-y-2">
            {navLinks(locale)
              .filter((link) => link.group === "info")
              .map((link) => (
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
        ©{" "}
        <span translate="no" className="notranslate">
          {shop.name}
        </span>
        . {messages.footer.rights}
      </p>
    </footer>
  );
}
