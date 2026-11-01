import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 筛选栏里的一组选项（品类、品牌、颜色……）：纯文字竖排，选中的变黑并在前面加一道短线。
 * 不用胶囊按钮，和杂志式的商品图更搭。
 * collapsible：选项多时可以收起，默认收起；选中了某一项时默认展开，收起时标题旁显示选中的是哪个。
 */
export function FilterChips({
  label,
  allLabel,
  options,
  active,
  href,
  collapsible = false,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  active?: string;
  href: (value?: string) => string;
  collapsible?: boolean;
}) {
  const list = (
    <nav aria-label={label}>
      <ul className="space-y-1.5">
        {[{ value: undefined, label: allLabel }, ...options].map((option) => {
          const selected = option.value === active;
          return (
            <li key={option.value ?? "all"}>
              <Link
                href={href(option.value)}
                aria-current={selected ? "page" : undefined}
                className={[
                  "group/opt flex items-center text-sm transition",
                  selected
                    ? "font-semibold text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={`h-px bg-neutral-900 transition-all ${selected ? "mr-2 w-3" : "w-0 group-hover/opt:mr-1.5 group-hover/opt:w-1.5"}`}
                />
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  if (!collapsible) return <FilterSection title={label}>{list}</FilterSection>;

  const activeLabel = options.find((o) => o.value === active)?.label;
  return (
    <details
      open={active !== undefined}
      className="group/sec py-5 first:pt-0 lg:first:pt-1"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-900">
          {label}
        </span>
        <span className="flex items-center gap-2 text-xs text-neutral-500">
          {activeLabel}
          <span
            aria-hidden="true"
            className="text-base leading-none text-neutral-900 transition-transform group-open/sec:rotate-45"
          >
            +
          </span>
        </span>
      </summary>
      <div className="mt-3">{list}</div>
    </details>
  );
}

/** 筛选栏里的一个分区：小标题 + 内容 */
export function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="py-5 first:pt-0 lg:first:pt-1">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-900">
        {title}
      </h2>
      {children}
    </section>
  );
}
