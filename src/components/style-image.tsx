import Image from "next/image";
import { thumbUrl } from "@/lib/images";

/** 雪服图是竖版 3:5。头盔套按图片自己的比例铺满宽度，不裁切、也不留白边 */
const ASPECTS = {
  outfit: "aspect-[3/5]",
} as const;

export type ImageAspect = keyof typeof ASPECTS | "helmet";

export function StyleImage({
  src,
  alt,
  sizes,
  priority,
  aspect = "outfit",
  thumb = false,
}: {
  src: string | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  aspect?: ImageAspect;
  /** 列表卡片等小尺寸展示用小图（见 src/lib/images.ts） */
  thumb?: boolean;
}) {
  if (thumb) src = thumbUrl(src);
  if (aspect === "helmet") {
    // 头盔套封面是正方形：width/height 先按正方形留出位置（加载后按图片自己的比例显示），不在首屏的图等滚动到附近再加载
    return src ? (
      <img
        src={src}
        alt={alt}
        width={1000}
        height={1000}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="block h-auto w-full"
      />
    ) : (
      <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 text-4xl text-neutral-300">
        🐰
      </div>
    );
  }

  return (
    <div className={`relative ${ASPECTS[aspect]} w-full overflow-hidden bg-neutral-100`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-4xl text-neutral-300">❄</div>
      )}
    </div>
  );
}
