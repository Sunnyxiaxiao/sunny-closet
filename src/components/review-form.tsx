"use client";

import { useActionState, useState } from "react";
import { submitReview, type ReviewFormState } from "@/app/[lang]/booking/[bookingNo]/actions";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/messages";

const inputClass =
  "mt-1.5 w-full border border-neutral-300 bg-white px-3 text-base focus:border-neutral-900 focus:outline-none";

/** 订单归还后，顾客在订单页写评价：星级、称呼、内容 */
export function ReviewForm({ bookingNo, locale }: { bookingNo: string; locale: Locale }) {
  const t = getMessages(locale).review;
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(submitReview, {});
  const [rating, setRating] = useState(Number(state.values?.rating) || 0);
  const errors = state.fieldErrors ?? {};

  if (state.done) {
    return (
      <div role="status" className="bg-emerald-50 px-5 py-4 text-emerald-900">
        <p className="font-semibold">{t.thanksTitle}</p>
        <p className="mt-1 text-sm">{t.thanksBody}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="bookingNo" value={bookingNo} />
      <input type="hidden" name="rating" value={rating || ""} />
      <fieldset>
        <legend className="text-sm text-neutral-600">{t.rating}</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={t.stars(n)}
              aria-pressed={rating === n}
              className={`text-3xl leading-none transition ${n <= rating ? "text-neutral-900" : "text-neutral-300 hover:text-neutral-500"}`}
            >
              ★
            </button>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-sm text-red-600">{errors.rating}</p>}
      </fieldset>
      <label className="block text-sm text-neutral-600">
        {t.name}
        <input
          name="name"
          maxLength={40}
          required
          defaultValue={state.values?.name}
          placeholder={t.namePlaceholder}
          className={`${inputClass} h-12`}
        />
        {errors.name && <span className="mt-1 block text-sm text-red-600">{errors.name}</span>}
      </label>
      <label className="block text-sm text-neutral-600">
        {t.body}
        <textarea
          name="body"
          maxLength={2000}
          required
          rows={5}
          defaultValue={state.values?.body}
          placeholder={t.bodyPlaceholder}
          className={`${inputClass} py-2`}
        />
        {errors.body && <span className="mt-1 block text-sm text-red-600">{errors.body}</span>}
      </label>
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center justify-center rounded-full bg-neutral-900 px-10 text-sm font-bold tracking-wider text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
