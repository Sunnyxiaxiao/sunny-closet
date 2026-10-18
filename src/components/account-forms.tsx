"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  requestPasswordReset,
  saveProfile,
  signInCustomer,
  signUpCustomer,
  updatePassword,
} from "@/app/[lang]/account/actions";
import { localePath, type Locale } from "@/i18n/config";
import { initialAccountFormState, type AccountFormState } from "@/lib/account/form-state";
import { getMessages } from "@/messages";

const inputClass =
  "mt-1.5 h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";
const buttonClass =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-neutral-600">
      {label}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

function Feedback({ state }: { state: AccountFormState }) {
  return (
    <>
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      {state.notice && (
        <p role="status" className="bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.notice}
        </p>
      )}
    </>
  );
}

export function LoginForm({ locale, next }: { locale: Locale; next?: string }) {
  const t = getMessages(locale).auth;
  const [state, action, pending] = useActionState(signInCustomer, initialAccountFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={t.email}>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} className={inputClass} />
      </Field>
      <Field label={t.password}>
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t.loggingIn : t.login}
      </button>
      <div className="flex justify-between text-sm">
        <Link href={localePath(locale, "/forgot-password")} className="underline underline-offset-4">
          {t.forgot}
        </Link>
        <span>
          {t.noAccount}{" "}
          <Link href={localePath(locale, "/signup")} className="font-semibold underline underline-offset-4">
            {t.signupLink}
          </Link>
        </span>
      </div>
    </form>
  );
}

export function SignupForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).auth;
  const [state, action, pending] = useActionState(signUpCustomer, initialAccountFormState);
  if (state.notice) {
    return (
      <div className="space-y-4">
        <Feedback state={state} />
        <Link href={localePath(locale, "/login")} className="inline-block text-sm underline underline-offset-4">
          {t.backToLogin}
        </Link>
      </div>
    );
  }
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t.name} error={errors.name}>
        <input name="name" required maxLength={60} autoComplete="name" defaultValue={state.values?.name} className={inputClass} />
      </Field>
      <Field label={t.email} error={errors.email}>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} className={inputClass} />
      </Field>
      <Field label={t.password} hint={t.passwordHint} error={errors.password}>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t.signingUp : t.signup}
      </button>
      <p className="text-sm">
        {t.haveAccount}{" "}
        <Link href={localePath(locale, "/login")} className="font-semibold underline underline-offset-4">
          {t.loginLink}
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).auth;
  const [state, action, pending] = useActionState(requestPasswordReset, initialAccountFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t.email} error={state.fieldErrors?.email}>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} className={inputClass} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t.sending : t.sendReset}
      </button>
      <Link href={localePath(locale, "/login")} className="inline-block text-sm underline underline-offset-4">
        {t.backToLogin}
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale).auth;
  const [state, action, pending] = useActionState(updatePassword, initialAccountFormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t.newPassword} hint={t.passwordHint} error={state.fieldErrors?.password}>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t.saving : t.savePassword}
      </button>
    </form>
  );
}

export function ProfileForm({
  locale,
  initial,
}: {
  locale: Locale;
  initial: { name: string; phone: string; wechat: string };
}) {
  const t = getMessages(locale).account;
  const [state, action, pending] = useActionState(saveProfile, initialAccountFormState);
  const errors = state.fieldErrors ?? {};
  const v = (key: keyof typeof initial) => state.values?.[key] ?? initial[key];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Field label={t.name} error={errors.name}>
        <input name="name" maxLength={60} autoComplete="name" defaultValue={v("name")} className={inputClass} />
      </Field>
      <Field label={t.phone} error={errors.phone}>
        <input name="phone" type="tel" maxLength={25} autoComplete="tel" defaultValue={v("phone")} className={inputClass} />
      </Field>
      <Field label={t.wechat} error={errors.wechat}>
        <input name="wechat" maxLength={60} defaultValue={v("wechat")} className={inputClass} />
      </Field>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${buttonClass} sm:w-auto sm:px-10`}>
        {pending ? t.saving : t.save}
      </button>
    </form>
  );
}
