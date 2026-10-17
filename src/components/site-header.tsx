import Link from "next/link";
import { shop } from "@/config/shop";
import { messages } from "@/messages/zh-CN";
import { MobileMenu } from "./mobile-menu";

export const navLinks = [
  { href: "/styles", label: messages.nav.styles },
  { href: "/rental-info", label: messages.nav.rentalInfo },
  { href: "/contact", label: messages.nav.contact },
] as const;

export function SiteHeader() {
  return (
    <>
      <p className="bg-neutral-900 px-4 py-2 text-center text-xs tracking-wide text-white">
        {messages.announcement}
      </p>
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto grid h-14 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:h-16">
          <div className="flex items-center">
            <MobileMenu links={navLinks} />
            <nav className="hidden gap-6 text-sm md:flex">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline underline-offset-4">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <Link href="/" className="text-lg font-black uppercase tracking-[0.2em] sm:text-xl">
            {shop.name}
          </Link>
          <div className="flex justify-end">
            <Link href="/styles" aria-label={messages.nav.styles} className="-mr-2 p-2">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
