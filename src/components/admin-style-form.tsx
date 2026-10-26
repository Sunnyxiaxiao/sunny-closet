"use client";

import { useActionState, useState, type ReactNode } from "react";
import { saveStyle } from "@/app/admin/inventory/actions";
import { AdminImageUploader } from "@/components/admin-image-uploader";
import { initialAccountFormState } from "@/lib/account/form-state";
import { OUTFIT_CATEGORIES, TAG_OPTIONS, type AdminStyleKind } from "@/lib/admin/style-form";
import type { StyleCategory } from "@/lib/supabase/database.types";
import { messages } from "@/messages/zh-CN";

const inputClass =
  "mt-1.5 h-11 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";
const textareaClass =
  "mt-1.5 min-h-56 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:border-neutral-900 focus:outline-none";

const DESCRIPTION_HINT = "排版：“## 标题”开始一个新的折叠段落，“- ”开头是一条列表，空行分段。第一个标题之前是开头的商品介绍。";

export interface StyleFormValues {
  /** 空 = 新增 */
  id: string;
  kind: AdminStyleKind;
  brand: string;
  category: StyleCategory;
  name: string;
  nameEn: string;
  deposit: string;
  /** 款式自己的价目表（美元，逗号分隔），空 = 按品类价目表 */
  prices: string;
  /** 手套丢失赔偿价（美元），空 = 不显示 */
  replacementValue: string;
  sortOrder: string;
  /** 商品介绍（中文 / 英文），排版规则见 src/lib/description.ts */
  description: string;
  descriptionEn: string;
  tags: string[];
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

const CATEGORY_PRICES_HINT: Record<string, string> = {
  jacket: "按全店“只租外套”价目表",
  pants: "按全店“只租雪裤”价目表",
};

/**
 * 后台雪服 / 手套的基本信息：品牌、品类、名称、押金、价格、标签、商品介绍、上下架。
 * 新增时还要填网址名、第一件库存（尺码、编号、采购价）和图片；编辑时图片和库存在页面下方单独管理。
 */
export function AdminStyleForm({ initial }: { initial: StyleFormValues }) {
  const [state, action, pending] = useActionState(saveStyle, initialAccountFormState);
  const [category, setCategory] = useState<StyleCategory>(initial.category);
  const [uploading, setUploading] = useState(false);
  const errors = state.fieldErrors ?? {};
  const v = (key: Exclude<keyof StyleFormValues, "isActive" | "id" | "tags" | "kind" | "category">) =>
    state.values?.[key] ?? initial[key];
  const isNew = !initial.id;
  const gloves = initial.kind === "gloves";
  const tagOptions = TAG_OPTIONS.filter((o) => (o.categories as readonly string[]).includes(category));
  const pricesHint = gloves
    ? "手套必须填自己的价目表：依次填租 1 天、2 天、3 天……的总价，用逗号隔开（后面的天数沿用最后一个）。"
    : `依次填租 1 天、2 天、3 天……的总价，用逗号隔开，例如 15, 22, 22, 28（后面的天数沿用最后一个）。留空 = ${CATEGORY_PRICES_HINT[category] ?? "按全店“完整套装”价目表（在“价格”里改）"}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="kind" value={initial.kind} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="品牌（选填）" error={errors.brand}>
          <input name="brand" maxLength={60} defaultValue={v("brand")} placeholder="例如 ISEE MIGGA" className={inputClass} />
        </Field>
        {gloves ? (
          <input type="hidden" name="category" value="gloves" />
        ) : (
          <Field label="品类" error={errors.category}>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as StyleCategory)}
              className={inputClass}
            >
              {OUTFIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {messages.categories[c]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="名称" error={errors.name}>
          <input name="name" required maxLength={60} defaultValue={v("name")} className={inputClass} />
        </Field>
        <Field label="英文名称" error={errors.nameEn}>
          <input name="nameEn" required maxLength={120} defaultValue={v("nameEn")} className={inputClass} />
        </Field>
        {isNew && (
          <Field label="网址名（选填）" hint="只能用小写字母、数字和连字符。不填按英文名称自动生成。" error={errors.slug}>
            <input name="slug" maxLength={80} defaultValue={state.values?.slug} placeholder="pink-bow-ski-suit" className={inputClass} />
          </Field>
        )}
        <Field label="押金（美元）" hint={isNew ? "不填按品类默认：成套 / 连体服 200、上衣 150、雪裤 100、手套 0" : undefined} error={errors.deposit}>
          <input name="deposit" inputMode="decimal" defaultValue={v("deposit")} className={inputClass} />
        </Field>
        <Field label="排序" hint="数字小的排前面" error={errors.sortOrder}>
          <input name="sortOrder" type="number" defaultValue={v("sortOrder")} className={inputClass} />
        </Field>
        {gloves && (
          <Field label="丢失赔偿价（美元，选填）" hint="显示在手套页面上；留空不显示" error={errors.replacementValue}>
            <input name="replacementValue" inputMode="decimal" defaultValue={v("replacementValue")} className={inputClass} />
          </Field>
        )}
      </div>
      <Field label={gloves ? "价目表（美元）" : "单独定价（美元，选填）"} hint={pricesHint} error={errors.prices}>
        <input
          name="prices"
          required={gloves}
          defaultValue={v("prices")}
          placeholder={gloves ? "10, 18, 25" : "留空按全店价目表"}
          className={inputClass}
        />
      </Field>
      {tagOptions.length > 0 && (
        <fieldset className="space-y-2 text-sm">
          <legend className="text-neutral-600">标签</legend>
          {tagOptions.map((o) => (
            <label key={o.tag} className="flex items-center gap-2">
              <input type="checkbox" name="tags" value={o.tag} defaultChecked={initial.tags.includes(o.tag)} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}

      {isNew && (
        <fieldset className="border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold">第一件库存</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={gloves ? "颜色 · 尺码" : "尺码"} error={errors.size}>
              <input
                name="size"
                required
                maxLength={20}
                defaultValue={state.values?.size}
                placeholder={gloves ? "例如 芭蕾粉 · S" : "例如 M、上衣 L · 背带裤 XL"}
                className={inputClass}
              />
            </Field>
            <Field label="编号（选填）" hint="不填自动接着往下编" error={errors.code}>
              <input name="code" maxLength={40} defaultValue={state.values?.code} className={inputClass} />
            </Field>
            <Field label="采购价（美元，选填）" error={errors.cost}>
              <input name="cost" inputMode="decimal" defaultValue={state.values?.cost} className={inputClass} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-neutral-500">保存后可以在编辑页继续加更多件（其他尺码 / 颜色）。</p>
        </fieldset>
      )}

      <Field label="商品介绍（中文）" hint={DESCRIPTION_HINT} error={errors.description}>
        <textarea name="description" maxLength={8000} defaultValue={v("description")} className={textareaClass} />
      </Field>
      <Field label="商品介绍（英文）" hint="英文页面显示这一段；改了中文记得同步改英文。" error={errors.descriptionEn}>
        <textarea name="descriptionEn" maxLength={8000} defaultValue={v("descriptionEn")} className={textareaClass} />
      </Field>

      {isNew && (
        <div>
          <p className="text-sm text-neutral-600">图片</p>
          <div className="mt-1.5">
            <AdminImageUploader
              name="imageUrls"
              initial={[]}
              folder={gloves ? "gloves" : "outfits"}
              error={errors.imageUrls}
              onBusyChange={setUploading}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-500">第一张是封面，可以拖动排序。建议先裁成 3:5 竖图；如果需要去水印、调比例，也可以把图发给 Claude 处理。</p>
        </div>
      )}

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
        disabled={pending || uploading}
        className="h-12 w-full rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {pending ? "保存中…" : uploading ? "图片上传中…" : isNew ? (gloves ? "新增手套" : "新增雪服") : "保存"}
      </button>
    </form>
  );
}
