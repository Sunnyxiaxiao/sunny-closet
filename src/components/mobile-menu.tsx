"use client";

import Link from "next/link";
import { useState } from "react";
import { localePath, type Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

export function MobileMenu({
  links,
  locale,
}: {
  links: readonly { href: string; label: string }[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const messages = getMessages(locale);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={messages.nav.menu}
        aria-expanded={open}
        className="-ml-2 p-2"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3.5 7h17M3.5 12h17M3.5 17h17" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={messages.nav.close}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <nav className="absolute inset-y-0 left-0 flex w-4/5 max-w-xs flex-col bg-white px-6 py-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={messages.nav.close}
              className="-ml-2 self-start p-2"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
              </svg>
            </button>
            <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
              {[{ href: localePath(locale, "/"), label: messages.nav.home }, ...links].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-4 text-base font-medium"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
