"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/messages";
import { StyleImage, type ImageAspect } from "./style-image";

/** 手机上左右滑动看图，电脑上点缩略图切换 */
export function ProductGallery({
  images,
  alt,
  aspect = "outfit",
  activeIndex,
  locale,
}: {
  images: string[];
  alt: string;
  aspect?: ImageAspect;
  /** 外部指定要显示的那张，例如选了头盔套颜色 */
  activeIndex?: number;
  locale: Locale;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(activeIndex ?? 0);
  // 外部换了要显示的那张时同步过来（渲染时对比上一次的值，见 React 文档“根据 props 调整 state”）
  const [applied, setApplied] = useState(activeIndex);
  if (activeIndex !== undefined && activeIndex !== applied) {
    setApplied(activeIndex);
    setIndex(activeIndex);
  }

  useLayoutEffect(() => {
    if (activeIndex === undefined) return;
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    track.scrollTo({ left: activeIndex * track.clientWidth, behavior: "auto" });
  }, [activeIndex, images.length]);

  if (images.length <= 1) {
    return <StyleImage src={images[0]} alt={alt} sizes="(min-width: 768px) 55vw, 100vw" priority aspect={aspect} />;
  }

  function goTo(i: number) {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: "auto" });
    setIndex(i);
  }

  return (
    <div className="min-w-0">
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth === 0) return;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="no-scrollbar flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((src, i) => (
          <div key={src} className="w-full shrink-0 snap-center">
            <StyleImage
              src={src}
              alt={`${alt}（${i + 1}/${images.length}）`}
              sizes="(min-width: 768px) 55vw, 100vw"
              priority={i === 0}
              aspect={aspect}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
        {images.map((src, i) => (
          <span
            key={src}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-neutral-900" : "w-1.5 bg-neutral-300"}`}
          />
        ))}
      </div>

      <div className="mt-3 hidden grid-cols-6 gap-2 md:grid">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => goTo(i)}
            aria-label={getMessages(locale).product.galleryImage(i + 1)}
            className={`relative ${aspect === "helmet" ? "aspect-square" : "aspect-[3/5]"} overflow-hidden bg-neutral-100 ring-offset-2 ${i === index ? "ring-1 ring-neutral-900" : "opacity-70 hover:opacity-100"}`}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="10vw"
              unoptimized
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
