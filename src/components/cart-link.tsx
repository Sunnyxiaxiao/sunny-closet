"use client";

import Link from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import { useCart } from "@/lib/cart";

/** 顶部导航的购物车图标，右上角显示件数 */
export function CartLink({ locale, label }: { locale: Locale; label: string }) {
  const count = useCart().length;
  return (
    <Link
      href={localePath(locale, "/cart")}
      aria-label={count > 0 ? `${label} (${count})` : label}
      title={label}
      className="relative p-1.5"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z" strokeLinejoin="round" />
        <path d="M9 10V6.5a3 3 0 0 1 6 0V10" strokeLinecap="round" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
