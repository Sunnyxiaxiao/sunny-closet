"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { BookingPanel } from "@/components/booking-panel";
import { ProductGallery } from "@/components/product-gallery";
import type { ImageAspect } from "@/components/style-image";

type PanelProps = ComponentProps<typeof BookingPanel>;

/** 头盔套、手套详情：选颜色时换到那一色的照片，并把这个颜色交给预订 */
export function HelmetCoverStage({
  images,
  alt,
  imageIndexBySize,
  before,
  after,
  panel,
  aspect = "helmet",
  choiceLabel,
}: {
  images: string[];
  alt: string;
  /** 颜色名 → 图片序号。0 是系列主图，不在这里 */
  imageIndexBySize: Record<string, number>;
  before: ReactNode;
  after?: ReactNode;
  panel: Omit<PanelProps, "onSizeChange" | "choiceLabel" | "hideSize">;
  aspect?: ImageAspect;
  /** 选项的叫法，例如「颜色」「颜色 · 尺码」 */
  choiceLabel: string;
}) {
  const [size, setSize] = useState(panel.initial.size ?? "");
  const activeIndex = imageIndexBySize[size] ?? 0;

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.78fr)] md:gap-8">
      <ProductGallery images={images} alt={alt} aspect={aspect} activeIndex={activeIndex} locale={panel.locale} />
      <div className="px-4 pt-5 md:sticky md:top-24 md:self-start md:px-0 md:pt-0">
        {before}
        <div className="mt-6 border-t border-neutral-200 pt-6">
          <BookingPanel {...panel} choiceLabel={choiceLabel} onSizeChange={setSize} />
        </div>
        {after}
      </div>
    </div>
  );
}
