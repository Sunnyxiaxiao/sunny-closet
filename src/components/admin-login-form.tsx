"use client";

import { useActionState } from "react";
import { signIn } from "@/app/admin/actions";
import { initialLoginState } from "@/lib/admin/login-state";
import { messages } from "@/messages/zh-CN";

const t = messages.admin;

const inputClass =
  "mt-1.5 h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialLoginState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm text-neutral-600">
        {t.email}
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={state.email}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-neutral-600">
        {t.password}
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </label>

      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t.signingIn : t.signIn}
      </button>
    </form>
  );
}
