"use client";

import Image from "next/image";
import { useId, type ReactNode } from "react";
import { thumbUrl } from "@/lib/images";
import Link from "@/components/storefront-link";
import { localePath, type Locale } from "@/i18n/config";
import type { AddOnOption } from "@/lib/helmet-covers";
import { formatMoney } from "@/lib/money";
import { getMessages } from "@/messages";

/**
 * 雪服页的加购（头盔套，或 kind="gloves" 的手套）：横向滑动的卡片，点一下选中，再点一下取消。
 * children 显示在卡片下面（手套的颜色 · 尺码）
 */
export function CompleteTheLook({
  options,
  selectedId,
  onSelect,
  availableCounts,
  kind = "helmet_cover",
  children,
  locale,
}: {
  options: Pick<AddOnOption, "id" | "name" | "imageUrl" | "addOnCents">[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 选了日期后：款式 id → 这段时间可租件数；还没选日期或正在查询时为 null */
  availableCounts: Record<string, number> | null;
  kind?: "helmet_cover" | "gloves";
  children?: ReactNode;
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.helmet;
  const text =
    kind === "gloves"
      ? { title: messages.gloves.addOnTitle, body: messages.gloves.addOnBody, pickDates: messages.gloves.pickDatesFirst, href: "/gloves", icon: "🧤" }
      : { title: t.completeTitle, body: t.completeBody, pickDates: t.pickDatesFirst, href: "/helmet-covers", icon: "🐰" };
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-base font-black">
          {text.title}
        </h2>
        <Link href={localePath(locale, text.href)} className="shrink-0 text-xs underline underline-offset-4">
          {messages.home.viewAll}
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
        {availableCounts ? text.body : text.pickDates}
      </p>

      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {options.map((option) => {
          const unavailable = availableCounts !== null && (availableCounts[option.id] ?? 0) === 0;
          const selected = selectedId === option.id && !unavailable;
          return (
            <li key={option.id} className="w-[38%] shrink-0 snap-start sm:w-36">
              <button
                type="button"
                disabled={unavailable}
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : option.id)}
                className={[
                  "group block w-full text-left transition",
                  unavailable ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "relative block aspect-square overflow-hidden bg-neutral-100 ring-offset-2 transition",
                    selected ? "ring-2 ring-neutral-900" : "",
                  ].join(" ")}
                >
                  {option.imageUrl ? (
                    <Image src={thumbUrl(option.imageUrl)} alt="" fill sizes="160px" unoptimized className="object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl">{text.icon}</span>
                  )}
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-xs text-white">
                      ✓
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-xs">{option.name}</span>
                <span className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="text-sm font-bold">+{formatMoney(option.addOnCents, { whole: true })}</span>
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      selected ? "bg-neutral-900 text-white" : "border border-neutral-300",
                    ].join(" ")}
                  >
                    {unavailable ? t.soldOut : selected ? t.selected : t.select}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
