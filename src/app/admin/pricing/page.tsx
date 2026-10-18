import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import { AdminPricingForm } from "@/components/admin-pricing-form";
import { requireAdmin } from "@/lib/admin/auth";

export default function AdminPricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="h-64 animate-pulse bg-neutral-100" />}>
        <Pricing />
      </Suspense>
    </div>
  );
}

async function Pricing() {
  const { supabase } = await requireAdmin();
  const { data: s, error } = await supabase
    .from("settings")
    .select("max_rental_days, rental_prices_cents, jacket_prices_cents, pants_prices_cents, shipping_min_days")
    .single();
  if (error) throw new Error(`读取设置失败：${error.message}`);

  return (
    <>
      <AdminNav current="pricing" />
      <p className="mt-6 max-w-2xl text-sm text-neutral-600">
        这里改的是全店统一的价目表：雪服按品类用其中一张（成套和连体服用“完整套装”，单件用“外套 / 雪裤”）。
        头盔套、手套，或者想给某一件单独定价的，在“库存”里点进那一件改。保存后网站立刻按新价格显示和收费，已经下的订单不变。
      </p>
      <div className="mt-8">
        <AdminPricingForm
          days={s.max_rental_days}
          tables={{ suit: s.rental_prices_cents, jacket: s.jacket_prices_cents, pants: s.pants_prices_cents }}
          shippingMinDays={s.shipping_min_days}
        />
      </div>
    </>
  );
}
