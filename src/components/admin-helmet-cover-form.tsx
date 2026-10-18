"use client";

import { useActionState, useState, type ReactNode } from "react";
import { saveHelmetCover } from "@/app/admin/helmet-covers/actions";
import { AdminImageUploader } from "@/components/admin-image-uploader";
import { initialHelmetCoverFormState } from "@/lib/admin/helmet-cover-state";
import { HELMET_COVER_DEFAULTS, HELMET_COVER_TIERS, HELMET_TAG_GROUPS, normalizeTags } from "@/lib/helmet-covers";
import type { HelmetCoverTier } from "@/lib/supabase/database.types";
import { messages } from "@/messages/zh-CN";

const t = messages.helmet;

const inputClass =
  "h-11 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

/** 表单里的值都是字符串；价格单位是美元 */
export interface HelmetCoverFormValues {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  descriptionEn: string;
  tier: HelmetCoverTier;
  tags: string;
  oneDay: string;
  twoToThreeDays: string;
  fourToSevenDays: string;
  addOn: string;
  replacementValue: string;
  deposit: string;
  sortOrder: string;
  isActive: boolean;
  imageUrls: string[];
}

const dollars = (cents: number) => String(cents / 100);

export const emptyHelmetCoverValues: HelmetCoverFormValues = {
  id: "",
  name: "",
  nameEn: "",
  slug: "",
  description: "",
  descriptionEn: "",
  tier: "regular",
  tags: "",
  oneDay: dollars(HELMET_COVER_DEFAULTS.standalone.oneDay),
  twoToThreeDays: dollars(HELMET_COVER_DEFAULTS.standalone.twoToThreeDays),
  fourToSevenDays: dollars(HELMET_COVER_DEFAULTS.standalone.fourToSevenDays),
  addOn: dollars(HELMET_COVER_DEFAULTS.addOnCents.regular),
  replacementValue: "",
  deposit: "0",
  sortOrder: "0",
  isActive: true,
  imageUrls: [],
};

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-600">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function AdminHelmetCoverForm({ initial }: { initial: HelmetCoverFormValues }) {
  const [state, formAction, pending] = useActionState(saveHelmetCover, initialHelmetCoverFormState);
  const [tier, setTier] = useState(initial.tier);
  const [addOn, setAddOn] = useState(initial.addOn);
  const [tags, setTags] = useState(initial.tags);
  const [uploading, setUploading] = useState(false);
  const errors = state.fieldErrors ?? {};
  const isNew = !initial.id;
  // 保存失败时用顾客刚填的值，否则用初始值
  const v = (key: Exclude<keyof HelmetCoverFormValues, "isActive" | "imageUrls" | "tier">) =>
    state.values?.[key] ?? initial[key];
  const currentTags = normalizeTags(tags);

  function changeTier(next: HelmetCoverTier) {
    // 加购价还是上一档的默认值时，跟着换成新一档的默认值
    if (addOn === dollars(HELMET_COVER_DEFAULTS.addOnCents[tier])) {
      setAddOn(dollars(HELMET_COVER_DEFAULTS.addOnCents[next]));
    }
    setTier(next);
  }

  function toggleTag(tag: string) {
    setTags(
      (currentTags.includes(tag) ? currentTags.filter((x) => x !== tag) : [...currentTags, tag]).join(", "),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={initial.id} />

      <section className="space-y-4">
        <h2 className="text-base font-bold">图片</h2>
        <AdminImageUploader
          name="imageUrls"
          initial={initial.imageUrls}
          folder="helmet-covers"
          error={errors.imageUrls}
          onBusyChange={setUploading}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="名称" error={errors.name}>
          <input name="name" required maxLength={60} defaultValue={v("name")} className={inputClass} />
        </Field>
        <Field label="英文名称" hint="英文页面显示，例如 Pink Bunny Helmet Cover" error={errors.nameEn}>
          <input name="nameEn" required maxLength={120} defaultValue={v("nameEn")} className={inputClass} />
        </Field>
        <Field label="网址名" hint="小写英文和连字符，例如 pink-bunny，会用在 /helmet-covers/pink-bunny" error={errors.slug}>
          <input name="slug" required defaultValue={v("slug")} className={inputClass} autoCapitalize="off" />
        </Field>
      </section>

      <fieldset>
        <legend className="text-sm text-neutral-600">档位</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {HELMET_COVER_TIERS.map((value) => (
            <label
              key={value}
              className={[
                "flex h-11 cursor-pointer items-center justify-center border text-sm font-semibold",
                tier === value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name="tier"
                value={value}
                checked={tier === value}
                onChange={() => changeTier(value)}
                className="sr-only"
              />
              {t.tiers[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <section>
        <h2 className="text-base font-bold">价格（美元）</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="单租 1 天" error={errors.oneDay}>
            <input name="oneDay" inputMode="decimal" defaultValue={v("oneDay")} className={inputClass} />
          </Field>
          <Field label="单租 2–3 天" error={errors.twoToThreeDays}>
            <input name="twoToThreeDays" inputMode="decimal" defaultValue={v("twoToThreeDays")} className={inputClass} />
          </Field>
          <Field label="单租 4–7 天" error={errors.fourToSevenDays}>
            <input name="fourToSevenDays" inputMode="decimal" defaultValue={v("fourToSevenDays")} className={inputClass} />
          </Field>
        </div>
        <p className="mt-1 text-xs text-neutral-500">每档是整个租期的总价，不按天相乘。</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="搭配雪服加购" error={errors.addOn}>
            <input
              name="addOn"
              inputMode="decimal"
              value={addOn}
              onChange={(e) => setAddOn(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="重置价值" hint="选填" error={errors.replacementValue}>
            <input name="replacementValue" inputMode="decimal" defaultValue={v("replacementValue")} className={inputClass} />
          </Field>
          <Field label="押金" error={errors.deposit}>
            <input name="deposit" inputMode="decimal" defaultValue={v("deposit")} className={inputClass} />
          </Field>
        </div>
      </section>

      <Field label="标签" hint="用逗号分隔，也可以点下面的常用标签" error={errors.tags}>
        <input name="tags" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} />
      </Field>
      <div className="-mt-3 space-y-2">
        {(Object.keys(HELMET_TAG_GROUPS) as (keyof typeof HELMET_TAG_GROUPS)[]).map((group) => (
          <div key={group} className="flex flex-wrap items-center gap-1.5">
            <span className="w-8 text-xs text-neutral-500">{t.filters[group]}</span>
            {HELMET_TAG_GROUPS[group].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={[
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  currentTags.includes(tag) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
                ].join(" ")}
              >
                {t.tags[tag] ?? tag}
              </button>
            ))}
          </div>
        ))}
      </div>

      <Field label="介绍" hint="“## 标题”开头是新的一段，“- ”开头是列表" error={errors.description}>
        <textarea
          name="description"
          rows={5}
          maxLength={3000}
          defaultValue={v("description")}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-base focus:border-neutral-900 focus:outline-none"
        />
      </Field>

      <Field label="英文介绍" hint="英文页面显示，格式同上；不填时英文页面显示中文介绍" error={errors.descriptionEn}>
        <textarea
          name="descriptionEn"
          rows={5}
          maxLength={6000}
          defaultValue={v("descriptionEn")}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-base focus:border-neutral-900 focus:outline-none"
        />
      </Field>

      <section className="grid grid-cols-2 gap-4">
        {isNew ? (
          <Field label="数量（件）" hint="同款有几件就填几" error={errors.quantity}>
            <input name="quantity" type="number" min={1} max={20} defaultValue={state.values?.quantity ?? 1} className={inputClass} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="排序" hint="数字小的排前面" error={errors.sortOrder}>
          <input name="sortOrder" type="number" defaultValue={v("sortOrder")} className={inputClass} />
        </Field>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="h-4 w-4" />
        上架（顾客能看到并预订）
      </label>

      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || uploading}
        className="h-12 w-full rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {uploading ? "图片上传中…" : pending ? "保存中…" : isNew ? "创建头盔套" : "保存修改"}
      </button>
    </form>
  );
}
