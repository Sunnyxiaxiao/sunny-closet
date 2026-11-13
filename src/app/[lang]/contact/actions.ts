"use server";

import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import type { AccountFormState } from "@/lib/account/form-state";
import { adminNotifyEmail, sendEmail } from "@/lib/email/send";
import { contactMessageEmail } from "@/lib/email/templates";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";
import { CONTACT_LIMITS, parseContactMessage } from "@/lib/validation/contact-message";
import { getMessages } from "@/messages";

/** Filled only by bots (people never see this field, see contact-form.tsx) */
const TRAP_FIELD = "website";

/** The contact page's form: emails the message to the shop, with the visitor as reply-to */
export async function sendContactMessage(_previous: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const localeValue = formData.get("locale");
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = getMessages(locale).contact;
  const values = { name: text("name"), email: text("email"), message: text("message") };

  // A bot gets the same answer as a person, and nothing is sent
  if (text(TRAP_FIELD)) return { notice: t.sent };

  const parsed = parseContactMessage(values);
  if (!parsed.ok) {
    const errors = { name: t.errors.name, email: t.errors.email, message: t.errors.message(CONTACT_LIMITS.message) };
    return { fieldErrors: Object.fromEntries(parsed.fields.map((field) => [field, errors[field]])), values };
  }

  // At most 3 per network per hour, and 40 a day in total (the shop mailbox sends about 500 emails a day, orders included)
  const [ipOk, allOk] = await Promise.all([
    clientIp().then((ip) => hitRateLimit("contact_ip", ip, 3, 3600)),
    hitRateLimit("contact_all", "all", 40, 86400),
  ]);
  if (ipOk === null || allOk === null) return { message: t.errors.failed, values };
  if (!ipOk || !allOk) return { message: t.errors.tooFrequent, values };

  const sent = await sendEmail(contactMessageEmail({ ...parsed.message, language: locale }, { to: adminNotifyEmail() }));
  return sent ? { notice: t.sent } : { message: t.errors.failed, values };
}
