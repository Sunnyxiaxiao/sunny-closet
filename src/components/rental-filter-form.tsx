import Link from "next/link";
import type { IsoDate } from "@/lib/dates";

const fieldClass = "h-11 border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

/** 款式列表页的筛选表单（普通 GET 表单，无需 JavaScript 也能用） */
export function RentalFilterForm({
  today,
  sizes,
  category,
  start,
  end,
  size,
}: {
  today: IsoDate;
  sizes: string[];
  category?: string;
  start?: string;
  end?: string;
  size?: string;
}) {
  const hasFilter = Boolean(start || end || size);
  return (
    <form
      action="/styles"
      method="get"
      className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      {category && <input type="hidden" name="category" value={category} />}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">取件日期</span>
        <input type="date" name="start" min={today} defaultValue={start} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600">归还日期</span>
        <input type="date" name="end" min={today} defaultValue={end} className={fieldClass} />
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
        <span className="text-neutral-600">尺码</span>
        <select name="size" defaultValue={size ?? ""} className={fieldClass}>
          <option value="">全部尺码</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button
          type="submit"
          className="h-11 flex-1 rounded-full bg-neutral-900 px-6 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 sm:flex-none"
        >
          查询可租
        </button>
        {hasFilter && (
          <Link
            href={category ? `/styles?category=${category}` : "/styles"}
            className="flex h-11 items-center rounded-full border border-neutral-300 px-5 text-sm hover:border-neutral-900"
          >
            清除
          </Link>
        )}
      </div>
    </form>
  );
}
