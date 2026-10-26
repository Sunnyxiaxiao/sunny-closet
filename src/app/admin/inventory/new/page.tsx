import Link from "next/link";
import { Suspense } from "react";
import { AdminStyleForm } from "@/components/admin-style-form";
import { requireAdmin } from "@/lib/admin/auth";
import { GLOVES_DEFAULT_PRICE_TEXT } from "@/lib/admin/style-form";

/** 新增雪服 / 手套：?kind=outfit | gloves */
export default function NewStylePage({ searchParams }: PageProps<"/admin/inventory/new">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse bg-neutral-100" />}>
        <NewStyleForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewStyleForm({ searchParams }: Pick<PageProps<"/admin/inventory/new">, "searchParams">) {
  await requireAdmin();
  const gloves = (await searchParams).kind === "gloves";
  const title = gloves ? "手套" : "雪服";
  return (
    <>
      <Link href={gloves ? "/admin/gloves" : "/admin/outfits"} className="text-sm underline underline-offset-4">
        ← {title}
      </Link>
      <h1 className="mt-4 text-2xl font-black">新增{title}</h1>
      <div className="mt-6">
        <AdminStyleForm
          initial={{
            id: "",
            kind: gloves ? "gloves" : "outfit",
            brand: "",
            category: gloves ? "gloves" : "suit",
            name: "",
            nameEn: "",
            deposit: "",
            prices: gloves ? GLOVES_DEFAULT_PRICE_TEXT : "",
            replacementValue: "",
            sortOrder: "500",
            description: "",
            descriptionEn: "",
            tags: [],
            isActive: true,
          }}
        />
      </div>
    </>
  );
}
