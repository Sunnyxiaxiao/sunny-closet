import Link from "next/link";
import { Suspense } from "react";
import { AdminHelmetCoverForm, emptyHelmetCoverValues } from "@/components/admin-helmet-cover-form";
import { requireAdmin } from "@/lib/admin/auth";

export default function NewHelmetCoverPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/admin/helmet-covers" className="text-sm underline underline-offset-4">
        ← 头盔套
      </Link>
      <h1 className="mt-4 text-2xl font-black">新增头盔套</h1>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse bg-neutral-100" />}>
        <NewHelmetCoverForm />
      </Suspense>
    </div>
  );
}

async function NewHelmetCoverForm() {
  await requireAdmin();
  return (
    <div className="mt-6">
      <AdminHelmetCoverForm initial={emptyHelmetCoverValues} />
    </div>
  );
}
