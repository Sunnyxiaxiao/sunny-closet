import Link from "next/link";

/** 一行可横向滑动的筛选标签（品类、品牌、颜色……） */
export function FilterChips({
  label,
  allLabel,
  options,
  active,
  href,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  active?: string;
  href: (value?: string) => string;
}) {
  return (
    <nav
      aria-label={label}
      className="no-scrollbar -mx-2 mt-3 flex gap-2 overflow-x-auto px-2 first-of-type:mt-5 sm:mx-0 sm:px-0"
    >
      {[{ value: undefined, label: allLabel }, ...options].map((option) => {
        const selected = option.value === active;
        return (
          <Link
            key={option.value ?? "all"}
            href={href(option.value)}
            aria-current={selected ? "page" : undefined}
            className={[
              "shrink-0 rounded-full border px-4 py-1.5 text-sm transition",
              selected
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 hover:border-neutral-900",
            ].join(" ")}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
