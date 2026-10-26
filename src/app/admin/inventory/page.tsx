import { Suspense } from "react";
import { InventoryList } from "@/components/admin-inventory-list";

/** 库存总览：全部品类的库存件、预订、总成本 */
export default function AdminInventoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <InventoryList />
      </Suspense>
    </div>
  );
}
