import Link from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { IsoDate } from "@/lib/dates";
import { getMessages, sizeLabel } from "@/messages";

const fieldClass =
  "h-9 w-full min-w-0 border-0 border-b border-neutral-300 bg-transparent px-0 text-sm focus:border-neutral-900 focus:outline-none focus:ring-0";

/** 款式列表页的筛选表单（普通 GET 表单，无需 JavaScript 也能用） */
export function RentalFilterForm({
  action = "/styles",
  today,
  sizes,
  keepParams = {},
  start,
  end,
  size,
  locale,
}: {
  action?: "/styles" | "/helmet-covers" | "/gloves";
  today: IsoDate;
  /** 为空时不显示尺码选择（例如头盔套） */
  sizes: string[];
  /** 提交和清除时保留的其他筛选条件，例如品类、品牌 */
  keepParams?: Record<string, string | undefined>;
  start?: string;
  end?: string;
  size?: string;
  locale: Locale;
}) {
  const t = getMessages(locale).filterForm;
  const path = localePath(locale, action);
  const hasFilter = Boolean(start || end || size);
  const keep = new URLSearchParams();
  for (const [key, value] of Object.entries(keepParams)) if (value) keep.set(key, value);
  return (
    // 放在左侧筛选栏里，宽度有限，所有字段竖着排
    <form action={path} method="get" className="grid gap-4">
      {[...keep].map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">{t.start}</span>
        <input type="date" name="start" min={today} defaultValue={start} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-neutral-500">{t.end}</span>
        <input type="date" name="end" min={today} defaultValue={end} className={fieldClass} />
      </label>
      {sizes.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-neutral-500">{t.size}</span>
          <select name="size" defaultValue={size ?? ""} className={fieldClass}>
            <option value="">{t.allSizes}</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {sizeLabel(s, locale)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          className="h-9 flex-1 border border-neutral-900 text-xs font-semibold uppercase tracking-[0.15em] transition hover:bg-neutral-900 hover:text-white"
        >
          {t.submit}
        </button>
        {hasFilter && (
          <Link
            href={keep.size ? `${path}?${keep}` : path}
            className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
          >
            {t.clear}
          </Link>
        )}
      </div>
    </form>
  );
}
