import Link from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { IsoDate } from "@/lib/dates";
import { getMessages, sizeLabel } from "@/messages";

const fieldClass = "h-11 border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

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
    <form
      action={path}
      method="get"
      className={[
        "grid grid-cols-2 gap-3 sm:items-end",
        sizes.length > 0 ? "sm:grid-cols-[1fr_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]",
      ].join(" ")}
    >
      {[...keep].map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">{t.start}</span>
        <input type="date" name="start" min={today} defaultValue={start} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">{t.end}</span>
        <input type="date" name="end" min={today} defaultValue={end} className={fieldClass} />
      </label>
      {sizes.length > 0 && (
        <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
          <span className="text-neutral-600">{t.size}</span>
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
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button
          type="submit"
          className="h-11 flex-1 rounded-full bg-neutral-900 px-6 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 sm:flex-none"
        >
          {t.submit}
        </button>
        {hasFilter && (
          <Link
            href={keep.size ? `${path}?${keep}` : path}
            className="flex h-11 items-center rounded-full border border-neutral-300 px-5 text-sm hover:border-neutral-900"
          >
            {t.clear}
          </Link>
        )}
      </div>
    </form>
  );
}
