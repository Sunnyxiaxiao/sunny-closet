"use client";

import { useActionState, useState } from "react";
import { saveStyleImages } from "@/app/admin/inventory/actions";
import { AdminImageUploader } from "@/components/admin-image-uploader";
import { initialAccountFormState } from "@/lib/account/form-state";

/** 后台一个款式的图片：拖动排序（第一张是封面）、删除、上传新图，点保存后前台生效 */
export function AdminStyleImages({ id, slug, initial }: { id: string; slug: string; initial: string[] }) {
  const [state, action, pending] = useActionState(saveStyleImages, initialAccountFormState);
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <AdminImageUploader name="imageUrls" initial={initial} folder={slug} onBusyChange={setBusy} />
      <p className="text-xs text-neutral-500">
        拖动图片调整顺序（手机上按住右上角的 ⠿ 拖），第一张是封面。新上传的图建议先裁成 3:5 竖图。
      </p>
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      {state.notice && <p className="bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{state.notice}</p>}
      <button
        type="submit"
        disabled={pending || busy}
        className="h-12 w-full rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {pending ? "保存中…" : busy ? "图片上传中…" : "保存图片"}
      </button>
    </form>
  );
}
