"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { submitBooking } from "@/app/[lang]/booking/actions";
import { localePath, type Locale } from "@/i18n/config";
import { initialBookingFormState } from "@/lib/booking/form-state";
import type { IsoDate } from "@/lib/dates";
import type { Quote } from "@/lib/pricing";
import { getMessages } from "@/messages";

export interface BookingSelection {
  start: IsoDate;
  end: IsoDate;
  size: string;
  quote: Quote;
}

const inputClass =
  "h-12 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-neutral-600">
      {label}
      <div className="mt-1.5">{children}</div>
      {error && (
        <span role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

/** 选好日期且有货之后出现的预订表单 */
export function CheckoutForm({
  styleId,
  selection,
  shippingMinDays,
  addOnIds = [],
  addOnPending = false,
  shippingBlocked = null,
  defaults,
  locale,
}: {
  styleId: string;
  selection: BookingSelection;
  shippingMinDays: number;
  /** 加购的配件（头盔套）款式 id，日期与这单相同 */
  addOnIds?: string[];
  /** 正在查询加购配件是否可租，查完前先不让提交 */
  addOnPending?: boolean;
  /** 这次没法邮寄的原因（来不及寄出 / 邮寄占用期间已被预订）；为 null 时可以邮寄 */
  shippingBlocked?: string | null;
  /** 登录的顾客：预先填好的联系方式 */
  defaults?: { name: string; email: string; phone: string; wechat: string };
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.checkout;
  const [state, formAction, pending] = useActionState(submitBooking, initialBookingFormState);
  const [fulfillment, setFulfillment] = useState(state.values?.fulfillment ?? "pickup");
  const errors = state.fieldErrors ?? {};
  const shippingTooShort =
    fulfillment === "shipping" && selection.quote.rentalDays < shippingMinDays;
  const shippingNotPossible = fulfillment === "shipping" && shippingBlocked !== null;

  return (
    <form action={formAction} className="space-y-4 border-t border-neutral-200 pt-6">
      <div>
        <h2 className="text-base font-bold">{t.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t.subtitle}</p>
      </div>

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="styleId" value={styleId} />
      <input type="hidden" name="size" value={selection.size} />
      <input type="hidden" name="start" value={selection.start} />
      <input type="hidden" name="end" value={selection.end} />
      {addOnIds.map((id) => (
        <input key={id} type="hidden" name="addOn" value={id} />
      ))}

      {/* 防机器人的隐藏输入框，真人看不到也不会填 */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          {t.honeypot}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label={t.name} error={errors.name}>
        <input
          name="name"
          required
          maxLength={60}
          autoComplete="name"
          defaultValue={state.values?.name ?? defaults?.name}
          className={inputClass}
        />
      </Field>

      <Field label={t.phone} error={errors.phone}>
        <input
          name="phone"
          type="tel"
          required
          maxLength={25}
          autoComplete="tel"
          inputMode="tel"
          defaultValue={state.values?.phone ?? defaults?.phone}
          className={inputClass}
        />
      </Field>

      <Field label={t.email} error={errors.email}>
        <input
          name="email"
          type="email"
          required
          maxLength={120}
          autoComplete="email"
          defaultValue={state.values?.email ?? defaults?.email}
          className={inputClass}
        />
      </Field>

      <Field label={t.wechat} error={errors.wechat}>
        <input
          name="wechat"
          maxLength={60}
          autoComplete="off"
          defaultValue={state.values?.wechat ?? defaults?.wechat}
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="text-sm text-neutral-600">{t.fulfillment}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["pickup", "shipping"] as const).map((method) => (
            <label
              key={method}
              className={[
                "flex h-12 cursor-pointer items-center justify-center border text-sm font-semibold transition",
                fulfillment === method
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white hover:border-neutral-900",
              ].join(" ")}
            >
              <input
                type="radio"
                name="fulfillment"
                value={method}
                checked={fulfillment === method}
                onChange={() => setFulfillment(method)}
                className="sr-only"
              />
              {messages.fulfillment[method]}
            </label>
          ))}
        </div>
        {errors.fulfillment && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.fulfillment}
          </p>
        )}
      </fieldset>

      {shippingTooShort && (
        <p role="alert" className="text-sm font-semibold text-amber-700">
          {t.shippingTooShort(shippingMinDays)}
        </p>
      )}

      {shippingNotPossible && !shippingTooShort && (
        <p role="alert" className="text-sm font-semibold text-amber-700">
          {shippingBlocked}
        </p>
      )}

      {fulfillment === "shipping" && (
        <Field label={t.address} error={errors.shippingAddress}>
          <textarea
            name="shippingAddress"
            required
            rows={3}
            maxLength={300}
            autoComplete="street-address"
            placeholder={t.addressPlaceholder}
            defaultValue={state.values?.shippingAddress}
            className="w-full border border-neutral-300 bg-white px-3 py-2 text-base focus:border-neutral-900 focus:outline-none"
          />
        </Field>
      )}

      <Field label={t.note} error={errors.note}>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder={t.notePlaceholder}
          defaultValue={state.values?.note}
          className="w-full border border-neutral-300 bg-white px-3 py-2 text-base focus:border-neutral-900 focus:outline-none"
        />
      </Field>

      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || shippingTooShort || shippingNotPossible || addOnPending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t.submitting : t.submit}
      </button>

      <p className="text-center text-xs text-neutral-500">
        {t.agreePrefix}
        <Link href={localePath(locale, "/rental-info")} className="underline underline-offset-2">
          {t.agreeLink}
        </Link>
      </p>
    </form>
  );
}
