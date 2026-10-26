import { Suspense } from "react";
import { InventoryList } from "@/components/admin-inventory-list";

/** 后台雪服：列表、库存状态、成本，右上角新增 */
export default function AdminOutfitsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <InventoryList only="outfit" />
      </Suspense>
    </div>
  );
}
