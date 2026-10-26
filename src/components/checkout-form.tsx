"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { submitOrder } from "@/app/[lang]/cart/actions";
import { localePath, type Locale } from "@/i18n/config";
import { initialBookingFormState } from "@/lib/booking/form-state";
import { clearCart, type CartLine } from "@/lib/cart";
import { SHIPPING_STATES, shippingPolicyArgs } from "@/lib/shipping";
import { getMessages } from "@/messages";

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

/** 购物车页的结算表单：联系方式、取件方式、邮寄地址。提交整个购物车，成功后清空购物车并跳到预订详情页 */
export function CheckoutForm({
  lines,
  shippingMinDays,
  fulfillment,
  onFulfillmentChange,
  blocked,
  defaults,
  locale,
}: {
  lines: CartLine[];
  shippingMinDays: number;
  /** 取件方式由购物车页管理（邮寄和自取能不能下单的条件不同） */
  fulfillment: string;
  onFulfillmentChange: (method: string) => void;
  /** 有商品需要先处理（没货、不能邮寄等）：不能提交，显示这句提示 */
  blocked: string | null;
  /** 登录的顾客：预先填好的联系方式 */
  defaults?: { name: string; email: string; phone: string; wechat: string };
  locale: Locale;
}) {
  const messages = getMessages(locale);
  const t = messages.checkout;
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitOrder, initialBookingFormState);
  const errors = state.fieldErrors ?? {};
  const shippingPolicy = messages.product.shippingPolicy(...shippingPolicyArgs(shippingMinDays));

  useEffect(() => {
    if (!state.redirectTo) return;
    clearCart();
    router.push(state.redirectTo);
  }, [state.redirectTo, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h2 className="text-base font-bold">{t.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t.subtitle}</p>
      </div>

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

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
                onChange={() => onFulfillmentChange(method)}
                className="sr-only"
              />
              {messages.fulfillment[method]}
              {method === "shipping" && (
                <span
                  className={[
                    "ml-2 px-1.5 py-0.5 text-xs font-bold",
                    fulfillment === method ? "bg-white text-neutral-900" : "bg-emerald-50 text-emerald-700",
                  ].join(" ")}
                >
                  {t.freeShippingTag}
                </span>
              )}
            </label>
          ))}
        </div>
        {errors.fulfillment && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {errors.fulfillment}
          </p>
        )}
      </fieldset>

      {fulfillment === "shipping" && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-neutral-900">{t.address}</legend>
          <p className="text-xs leading-relaxed text-neutral-500">{shippingPolicy}</p>
          <Field label={t.street} error={errors.shippingStreet}>
            <input
              name="shippingStreet"
              required
              maxLength={200}
              autoComplete="shipping street-address"
              placeholder={t.streetPlaceholder}
              defaultValue={state.values?.shippingStreet}
              className={inputClass}
            />
          </Field>
          <Field label={t.city} error={errors.shippingCity}>
            <input
              name="shippingCity"
              required
              maxLength={80}
              autoComplete="shipping address-level2"
              defaultValue={state.values?.shippingCity}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.state} error={errors.shippingState}>
              <select
                name="shippingState"
                required
                autoComplete="shipping address-level1"
                defaultValue={state.values?.shippingState ?? ""}
                className={inputClass}
              >
                <option value="">{t.statePlaceholder}</option>
                {SHIPPING_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.zip} error={errors.shippingZip}>
              <input
                name="shippingZip"
                required
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{5}(-[0-9]{4})?"
                autoComplete="shipping postal-code"
                defaultValue={state.values?.shippingZip}
                className={inputClass}
              />
            </Field>
          </div>
        </fieldset>
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

      {blocked && (
        <p role="alert" className="text-sm font-semibold text-amber-700">
          {blocked}
        </p>
      )}

      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || blocked !== null || Boolean(state.redirectTo)}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending || state.redirectTo ? t.submitting : t.submit}
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
