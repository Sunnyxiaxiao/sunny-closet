"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/app/[lang]/contact/actions";
import type { Locale } from "@/i18n/config";
import { initialAccountFormState } from "@/lib/account/form-state";
import { CONTACT_LIMITS } from "@/lib/validation/contact-message";
import { getMessages } from "@/messages";

const inputClass =
  "mt-1.5 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

/** 联系页的留言表单：提交后发邮件到店铺邮箱（src/app/[lang]/contact/actions.ts） */
export function ContactForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).contact;
  const [state, action, pending] = useActionState(sendContactMessage, initialAccountFormState);
  const errors = state.fieldErrors ?? {};
  const error = (field: string) =>
    errors[field] && (
      <span role="alert" className="mt-1 block text-sm text-red-600">
        {errors[field]}
      </span>
    );

  if (state.notice) {
    return (
      <p role="status" className="bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {state.notice}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {/* 给机器人的陷阱：真人看不到也不会填 */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-neutral-600">
          {t.name}
          <input
            name="name"
            required
            maxLength={CONTACT_LIMITS.name}
            autoComplete="name"
            defaultValue={state.values?.name}
            className={`${inputClass} h-12`}
          />
          {error("name")}
        </label>
        <label className="block text-sm text-neutral-600">
          {t.yourEmail}
          <input
            name="email"
            type="email"
            required
            maxLength={CONTACT_LIMITS.email}
            autoComplete="email"
            defaultValue={state.values?.email}
            className={`${inputClass} h-12`}
          />
          {error("email")}
        </label>
      </div>
      <label className="block text-sm text-neutral-600">
        {t.message}
        <textarea
          name="message"
          required
          rows={5}
          maxLength={CONTACT_LIMITS.message}
          defaultValue={state.values?.message}
          className={`${inputClass} py-2.5`}
        />
        {errors.message ? error("message") : <span className="mt-1 block text-xs text-neutral-500">{t.messageHint}</span>}
      </label>
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-neutral-900 px-10 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
