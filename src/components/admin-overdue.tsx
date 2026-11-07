"use client";

import { useActionState } from "react";
import { setExpectedReturn } from "@/app/admin/actions";
import type { ReturnDateState } from "@/lib/admin/return-date-state";
import type { OverdueInfo } from "@/lib/booking/overdue";
import { formatDateZh } from "@/lib/dates";

/**
 * Picked-up order not back on time (or with an expected return date): how late it is, until when it holds the piece,
 * which orders it runs into, and the form for the expected return date.
 */
export function AdminOverdue({
  bookingId,
  info,
  expectedReturn,
  holdDays,
  conflicts,
  today,
}: {
  bookingId: string;
  info: OverdueInfo | null;
  expectedReturn: string | null;
  holdDays: number;
  /** Orders already booked on a piece this order still holds */
  conflicts: { bookingNo: string; startDate: string; itemCode: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(setExpectedReturn, {} as ReturnDateState);
  const late = info && info.lateDays > 0;

  return (
    <div className={`mt-4 p-3 text-sm ${late || conflicts.length ? "bg-red-50 text-red-900" : "bg-sky-50 text-sky-900"}`}>
      {late && (
        <p className="font-semibold">
          逾期未还 {info.lateDays} 天
        </p>
      )}
      {info?.holdUntil && (
        <p className="mt-0.5">
          {info.byExpectedReturn
            ? `按预计归还日占用到 ${formatDateZh(info.holdUntil)}（含清洁日）`
            : `每天顺延，目前占用到 ${formatDateZh(info.holdUntil)}（今天 + ${holdDays} 天），点“已归还”才释放`}
        </p>
      )}
      {conflicts.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-semibold">
          {conflicts.map((c) => (
            <li key={`${c.bookingNo}-${c.itemCode}`}>
              逾期件冲突：{c.itemCode} 影响订单 {c.bookingNo}（{formatDateZh(c.startDate)} 开始）。请联系顾客、换一件或取消
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <label className="text-xs">
          预计归还日
          <input
            key={state.conflicts ? "confirm" : (expectedReturn ?? "")}
            name="date"
            type="date"
            min={today}
            defaultValue={state.date ?? expectedReturn ?? ""}
            className="mt-1 block h-9 border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
          />
        </label>
        {state.conflicts ? (
          <>
            {/* Confirms only the date the conflicts were listed for; a different date gets checked again */}
            <input type="hidden" name="confirm" value={state.date} />
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-full bg-red-700 px-4 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
            >
              仍然保存
            </button>
          </>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-full bg-neutral-900 px-4 text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        )}
        <span className="w-full text-xs opacity-80">留空保存 = 清除，回到“今天 + {holdDays} 天”顺延</span>
      </form>
      {state.conflicts && (
        <p role="alert" className="mt-2 font-semibold">
          这个日期会占到已有订单 {state.conflicts.join("、")} 的日期。确认要保存吗？已有订单不会被改动，需要你另外联系顾客处理。
        </p>
      )}
      {state.message && (
        <p role={state.ok ? undefined : "alert"} className="mt-2 text-xs font-semibold">
          {state.message}
        </p>
      )}
    </div>
  );
}
