"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 商品列表页的筛选栏：
 * - 电脑（lg 及以上）：固定在左侧，一直显示
 * - 手机：只显示一个“筛选”按钮，点开从左侧滑出；点了某个筛选或提交日期后自动收起
 * 筛选内容本身是服务端渲染的链接和表单（children），不开 JavaScript 也能在电脑上用。
 */
export function FilterPanel({
  title,
  activeCount,
  closeLabel,
  children,
}: {
  title: string;
  /** 已选了几个筛选条件，显示在手机按钮上 */
  activeCount: number;
  closeLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const label = activeCount > 0 ? `${title} (${activeCount})` : title;

  return (
    <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex items-center gap-2 border-b border-neutral-900 pb-0.5 text-xs font-semibold uppercase tracking-[0.2em] lg:hidden"
      >
        {label}
        <span aria-hidden="true" className="text-base font-normal leading-none">
          +
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <div
        role={open ? "dialog" : undefined}
        aria-label={title}
        // 点到链接或提交表单就收起（页面会换成新的筛选结果）
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        onSubmitCapture={() => setOpen(false)}
        className={[
          "fixed inset-y-0 left-0 z-50 w-[80%] max-w-xs overflow-y-auto bg-white px-6 pb-10 pt-5 shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:p-0 lg:shadow-none lg:transition-none",
        ].join(" ")}
      >
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">{title}</p>
          <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="-mr-2 p-2 text-2xl font-light leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}

/** 列表页的左右两栏：左边筛选，右边商品 */
export function ShopColumns({ filters, children }: { filters: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4 lg:mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
      {filters}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
