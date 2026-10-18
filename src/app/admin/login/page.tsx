import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/admin/actions";
import { AdminLoginForm } from "@/components/admin-login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-black">{t.loginTitle}</h1>
      <div className="mt-8">
        <Suspense fallback={<div className="h-48 animate-pulse bg-neutral-100" aria-busy="true" />}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function LoginBody({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  const { error } = await searchParams;
  await connection();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) redirect("/admin");

    // 已登录，但这个账号不是管理员：让对方可以退出换号
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm font-semibold text-red-600">
          {t.forbidden}
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-neutral-900 text-sm font-bold tracking-wider hover:bg-neutral-100"
          >
            {t.signOut}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {error === "forbidden" && (
        <p role="alert" className="mb-4 text-sm font-semibold text-red-600">
          {t.forbidden}
        </p>
      )}
      <AdminLoginForm />
    </>
  );
}
