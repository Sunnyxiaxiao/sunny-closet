"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { StyleImage } from "./style-image";

/** 手机上左右滑动看图，电脑上点缩略图切换 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (images.length <= 1) {
    return <StyleImage src={images[0]} alt={alt} sizes="(min-width: 768px) 55vw, 100vw" priority />;
  }

  function goTo(i: number) {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((src, i) => (
          <div key={src} className="w-full shrink-0 snap-center">
            <StyleImage
              src={src}
              alt={`${alt}（${i + 1}/${images.length}）`}
              sizes="(min-width: 768px) 55vw, 100vw"
              priority={i === 0}
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
            aria-label={`查看第 ${i + 1} 张图`}
            className={`relative aspect-[3/5] overflow-hidden bg-neutral-100 ring-offset-2 ${i === index ? "ring-1 ring-neutral-900" : "opacity-70 hover:opacity-100"}`}
          >
            <Image src={src} alt="" fill sizes="10vw" unoptimized className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
