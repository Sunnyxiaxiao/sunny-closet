import Link from "@/components/storefront-link";
import { localePath, type Locale } from "@/i18n/config";
import type { IsoDate } from "@/lib/dates";
import { getMessages, sizeLabel } from "@/messages";

const fieldClass =
  "h-9 w-full min-w-0 border-0 border-b border-neutral-300 bg-transparent px-0 text-sm focus:border-neutral-900 focus:outline-none focus:ring-0";

/**
 * 手机上列表顶部的日期栏：不用点开“筛选”就能填滑雪日期（电脑上左侧筛选栏一直显示，不需要）。
 * 和筛选栏里的表单提交到同一个地址；keepParams 里带上其余筛选条件（品类、品牌、尺码…）
 */
export function DateQuickBar({
  action = "/styles",
  today,
  keepParams = {},
  start,
  end,
  locale,
}: {
  action?: "/styles" | "/helmet-covers" | "/gloves";
  today: IsoDate;
  keepParams?: Record<string, string | undefined>;
  start?: string;
  end?: string;
  locale: Locale;
}) {
  const t = getMessages(locale).filterForm;
  const path = localePath(locale, action);
  const keep = new URLSearchParams();
  for (const [key, value] of Object.entries(keepParams)) if (value) keep.set(key, value);
  const inputClass = "h-10 w-full min-w-0 border border-neutral-300 bg-white px-2 text-sm focus:border-neutral-900 focus:outline-none";
  return (
    <form action={path} method="get" className="mx-2 mt-4 bg-neutral-50 p-3 sm:mx-0 lg:hidden">
      {[...keep].map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="text-xs font-semibold text-neutral-700">{t.quickTitle}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          {t.start}
          <input type="date" name="start" min={today} defaultValue={start} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          {t.end}
          <input type="date" name="end" min={today} defaultValue={end} required className={inputClass} />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-4">
        <button
          type="submit"
          className="h-10 flex-1 bg-neutral-900 text-xs font-semibold uppercase tracking-[0.15em] text-white transition hover:bg-neutral-700"
        >
          {t.submit}
        </button>
        {(start || end) && (
          <Link href={keep.size ? `${path}?${keep}` : path} className="text-xs text-neutral-500 underline underline-offset-4">
            {t.clear}
          </Link>
        )}
      </div>
    </form>
  );
}

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
