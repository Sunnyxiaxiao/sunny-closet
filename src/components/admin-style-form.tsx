"use client";

import { useActionState, type ReactNode } from "react";
import { saveStyle } from "@/app/admin/inventory/actions";
import { initialAccountFormState } from "@/lib/account/form-state";

const inputClass =
  "mt-1.5 h-11 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

export interface StyleFormValues {
  id: string;
  name: string;
  nameEn: string;
  deposit: string;
  /** 款式自己的价目表（美元，逗号分隔），空 = 按品类价目表 */
  prices: string;
  sortOrder: string;
  isActive: boolean;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-neutral-600">
      {label}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

/** 后台“库存”里一个款式的基本信息：名称、押金、价格、上下架 */
export function AdminStyleForm({ initial, categoryPricesHint }: { initial: StyleFormValues; categoryPricesHint: string }) {
  const [state, action, pending] = useActionState(saveStyle, initialAccountFormState);
  const errors = state.fieldErrors ?? {};
  const v = (key: Exclude<keyof StyleFormValues, "isActive" | "id">) => state.values?.[key] ?? initial[key];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={initial.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="名称" error={errors.name}>
          <input name="name" required maxLength={60} defaultValue={v("name")} className={inputClass} />
        </Field>
        <Field label="英文名称" error={errors.nameEn}>
          <input name="nameEn" required maxLength={120} defaultValue={v("nameEn")} className={inputClass} />
        </Field>
        <Field label="押金（美元）" error={errors.deposit}>
          <input name="deposit" inputMode="decimal" defaultValue={v("deposit")} className={inputClass} />
        </Field>
        <Field label="排序" hint="数字小的排前面" error={errors.sortOrder}>
          <input name="sortOrder" type="number" defaultValue={v("sortOrder")} className={inputClass} />
        </Field>
      </div>
      <Field
        label="单独定价（美元，选填）"
        hint={`依次填租 1 天、2 天、3 天……的总价，用逗号隔开，例如 15, 22, 22, 28（后面的天数沿用最后一个）。留空 = ${categoryPricesHint}`}
        error={errors.prices}
      >
        <input name="prices" defaultValue={v("prices")} placeholder="留空按全店价目表" className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="h-4 w-4" />
        上架（顾客能看到并预订）
      </label>
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      {state.notice && <p className="bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{state.notice}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
