import Link from "next/link";
import type { IsoDate } from "@/lib/dates";

/** 款式列表页的筛选表单（普通 GET 表单，无需 JavaScript 也能用） */
export function RentalFilterForm({
  today,
  sizes,
  start,
  end,
  size,
}: {
  today: IsoDate;
  sizes: string[];
  start?: string;
  end?: string;
  size?: string;
}) {
  const hasFilter = Boolean(start || end || size);
  return (
    <form
      action="/styles"
      method="get"
      className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">取件日期</span>
        <input
          type="date"
          name="start"
          min={today}
          defaultValue={start}
          className="h-11 rounded-xl border border-slate-300 px-3 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">归还日期</span>
        <input
          type="date"
          name="end"
          min={today}
          defaultValue={end}
          className="h-11 rounded-xl border border-slate-300 px-3 text-base"
        />
      </label>
      <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
        <span className="text-slate-600">尺码</span>
        <select
          name="size"
          defaultValue={size ?? ""}
          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base"
        >
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
          className="h-11 flex-1 rounded-xl bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 sm:flex-none"
        >
          查询可租
        </button>
        {hasFilter && (
          <Link
            href="/styles"
            className="flex h-11 items-center rounded-xl border border-slate-300 px-4 text-slate-600 hover:bg-slate-50"
          >
            清除
          </Link>
        )}
      </div>
    </form>
  );
}
