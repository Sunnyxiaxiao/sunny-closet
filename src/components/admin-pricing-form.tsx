"use client";

import { useActionState } from "react";
import { savePrices } from "@/app/admin/pricing/actions";
import { initialAccountFormState } from "@/lib/account/form-state";
import { PRICE_TABLES, centsToDollars, type PriceTableKey } from "@/lib/admin/price-form";

const cellInput =
  "h-10 w-full min-w-14 border border-neutral-300 bg-white px-2 text-right text-base tabular-nums focus:border-neutral-900 focus:outline-none";

export function AdminPricingForm({
  days,
  tables,
  shippingMinDays,
}: {
  days: number;
  tables: Record<PriceTableKey, number[]>;
  shippingMinDays: number;
}) {
  const [state, action, pending] = useActionState(savePrices, initialAccountFormState);
  const errors = state.fieldErrors ?? {};
  const value = (key: PriceTableKey, day: number) =>
    state.values?.[`${key}-${day}`] ?? centsToDollars(tables[key][Math.min(day, tables[key].length) - 1]);

  return (
    <form action={action} className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-xs text-neutral-500">
              <th className="py-2 pr-3 text-left font-medium">价目表（美元，整个租期的总价）</th>
              {Array.from({ length: days }, (_, i) => (
                <th key={i} className="px-1 py-2 text-center font-medium">
                  {i + 1} 天
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {PRICE_TABLES.map((table) => (
              <tr key={table.key}>
                <th className="py-3 pr-3 text-left align-top font-semibold">
                  {table.label}
                  {errors[table.key] && (
                    <span role="alert" className="mt-1 block text-xs font-normal text-red-600">
                      {errors[table.key]}
                    </span>
                  )}
                </th>
                {Array.from({ length: days }, (_, i) => (
                  <td key={i} className="px-1 py-3">
                    <input
                      name={`${table.key}-${i + 1}`}
                      inputMode="decimal"
                      aria-label={`${table.label} ${i + 1} 天`}
                      defaultValue={value(table.key, i + 1)}
                      className={cellInput}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="block max-w-xs text-sm text-neutral-600">
        邮寄最短租几天
        <input
          name="shippingMinDays"
          type="number"
          min={1}
          max={days}
          defaultValue={state.values?.shippingMinDays ?? shippingMinDays}
          className="mt-1.5 h-11 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none"
        />
        {errors.shippingMinDays && (
          <span role="alert" className="mt-1 block text-sm text-red-600">
            {errors.shippingMinDays}
          </span>
        )}
      </label>

      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      {state.notice && <p className="bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{state.notice}</p>}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {pending ? "保存中…" : "保存价格"}
      </button>
    </form>
  );
}
