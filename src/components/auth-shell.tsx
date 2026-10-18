import type { ReactNode } from "react";

/** 登录、注册、重设密码页面的外框：标题 + 说明 + 表单 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-sm px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-black">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-neutral-600">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function AuthSkeleton() {
  return <div className="h-64 animate-pulse bg-neutral-100" aria-busy="true" />;
}
