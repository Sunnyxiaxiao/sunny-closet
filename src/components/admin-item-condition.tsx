"use client";

import { useActionState, useState } from "react";
import { saveItemCondition } from "@/app/admin/inventory/actions";
import { AdminImageUploader } from "@/components/admin-image-uploader";
import { initialAccountFormState } from "@/lib/account/form-state";

const textareaClass =
  "mt-1 w-full border border-neutral-300 bg-white px-2 py-1.5 text-sm leading-relaxed focus:border-neutral-900 focus:outline-none";

/**
 * 一件库存的状态说明：有明显瑕疵、需要提前告诉顾客的才写（中文必填，英文可以留空让 Claude 翻译）+ 特写照片。
 * 默认收起；已经写了的默认展开
 */
export function AdminItemCondition({
  itemId,
  returnTo,
  folder,
  initial,
}: {
  itemId: string;
  returnTo: string;
  /** 存储桶里放照片的文件夹 */
  folder: string;
  initial: { note: string; noteEn: string; imageUrls: string[] };
}) {
  const [state, action, pending] = useActionState(saveItemCondition, initialAccountFormState);
  const [busy, setBusy] = useState(false);
  return (
    <details open={initial.note !== ""} className="group mt-4 border-t border-neutral-100 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-widest text-neutral-500 [&::-webkit-details-marker]:hidden">
        <span>
          状态说明（顾客能看到）
          {initial.note && <span className="ml-2 bg-amber-100 px-1.5 py-0.5 normal-case tracking-normal text-amber-900">已声明</span>}
        </span>
        <span aria-hidden="true" className="text-base leading-none text-neutral-900 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <p className="text-xs leading-relaxed text-neutral-500">
          只写需要提前声明的瑕疵。写了之后，商品页会多一栏“状态说明”，顾客下单前要勾选“已查看”；订单里会存下单时的说明和照片。
          这些瑕疵按条款不算损坏。清空说明 = 不再显示。
        </p>
        <label className="block text-xs text-neutral-500">
          说明（中文）
          <textarea name="note" rows={2} maxLength={1000} defaultValue={initial.note} placeholder="例如：左袖口有约 1cm 的小勾丝，不影响穿着" className={textareaClass} />
        </label>
        <label className="block text-xs text-neutral-500">
          说明（英文，可以留空让 Claude 翻译）
          <textarea name="noteEn" rows={2} maxLength={1000} defaultValue={initial.noteEn} className={textareaClass} />
        </label>
        <div>
          <p className="mb-1 text-xs text-neutral-500">特写照片（最多 10 张）</p>
          <AdminImageUploader name="conditionImages" initial={initial.imageUrls} folder={folder} onBusyChange={setBusy} markCover={false} />
        </div>
        {state.message && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {state.message}
          </p>
        )}
        {state.notice && <p className="bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.notice}</p>}
        <button
          type="submit"
          disabled={pending || busy}
          className="h-9 rounded-full border border-neutral-900 px-4 text-xs font-bold hover:bg-neutral-100 disabled:opacity-50"
        >
          {pending ? "保存中…" : busy ? "照片上传中…" : "保存状态说明"}
        </button>
      </form>
    </details>
  );
}
