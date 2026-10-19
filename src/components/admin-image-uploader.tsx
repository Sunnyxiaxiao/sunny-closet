"use client";

import Image from "next/image";
import { IMAGE_BUCKET, IMAGE_CACHE_SECONDS, THUMB_WIDTH, thumbUrl } from "@/lib/images";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MAX_SIDE = 2000;

/** 在浏览器里把照片转正、缩小并转成 JPG（存储桶单张上限 5MB）。maxWidth 只限制宽度，用来生成小图 */
async function toJpeg(file: File, size: { maxSide: number } | { maxWidth: number }, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(
    1,
    "maxSide" in size ? size.maxSide / Math.max(bitmap.width, bitmap.height) : size.maxWidth / bitmap.width,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片处理");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片转换失败"))), "image/jpeg", quality),
  );
}

/** 后台上传商品图：可多选，第一张是封面，可以调整顺序和删除。图片地址通过隐藏输入框随表单提交 */
export function AdminImageUploader({
  name,
  initial,
  folder,
  error,
  onBusyChange,
}: {
  name: string;
  initial: string[];
  /** 存储桶里的文件夹，例如 helmet-covers */
  folder: string;
  error?: string;
  /** 开始 / 结束上传时通知表单，上传完成前不让保存 */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [urls, setUrls] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(files: FileList) {
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    setUploading(files.length);
    onBusyChange?.(true);
    for (const file of Array.from(files)) {
      try {
        const [full, thumb] = await Promise.all([
          toJpeg(file, { maxSide: MAX_SIDE }, 0.85),
          toJpeg(file, { maxWidth: THUMB_WIDTH }, 0.8),
        ]);
        const id = crypto.randomUUID();
        const options = { contentType: "image/jpeg", cacheControl: IMAGE_CACHE_SECONDS };
        // 先传小图：列表页按 xxx.sm.jpg 找小图，大图地址加进表单时小图必须已经在了
        for (const [path, blob] of [[`${folder}/${id}.sm.jpg`, thumb], [`${folder}/${id}.jpg`, full]] as const) {
          const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, options);
          if (uploadError) throw new Error(uploadError.message);
        }
        const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(`${folder}/${id}.jpg`);
        setUrls((current) => [...current, data.publicUrl]);
      } catch (e) {
        setMessage(`「${file.name}」上传失败：${e instanceof Error ? e.message : "未知错误"}。HEIC 照片请在 Safari 里上传，或先存成 JPG。`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onBusyChange?.(false);
  }

  function move(index: number, delta: number) {
    setUrls((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  return (
    <div>
      {urls.map((url) => (
        <input key={url} type="hidden" name={name} value={url} />
      ))}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {urls.map((url, index) => (
          <li key={url} className="relative">
            <div className="relative aspect-square overflow-hidden bg-neutral-100">
              <Image src={thumbUrl(url)} alt="" fill sizes="160px" unoptimized className="object-cover" />
              {index === 0 && (
                <span className="absolute left-1 top-1 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  封面
                </span>
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="px-1.5 disabled:opacity-30" aria-label="往前移">
                ←
              </button>
              <button type="button" onClick={() => setUrls((c) => c.filter((u) => u !== url))} className="px-1.5 text-red-600" aria-label="删除这张">
                删除
              </button>
              <button type="button" disabled={index === urls.length - 1} onClick={() => move(index, 1)} className="px-1.5 disabled:opacity-30" aria-label="往后移">
                →
              </button>
            </div>
          </li>
        ))}
        <li>
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center border border-dashed border-neutral-400 text-center text-xs text-neutral-600 hover:border-neutral-900">
            <span className="text-2xl leading-none">+</span>
            <span className="mt-1">{uploading > 0 ? `上传中（${uploading}）…` : "添加图片"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={uploading > 0}
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </li>
      </ul>
      {(message || error) && <p className="mt-2 text-sm text-red-600">{message ?? error}</p>}
    </div>
  );
}
