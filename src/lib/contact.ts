import { shop } from "@/config/shop";

/**
 * Links that open the customer's own text / email app with a message to the shop already written
 * (the shop takes texts and emails, no calls; nothing is sent from the site itself).
 */
export function contactLinks(subject: string, body: string): { sms: string; email: string } {
  const phone = `+1${shop.contact.phone.replace(/\D/g, "")}`;
  return {
    // "?&body=" is the form both iOS and Android accept
    sms: `sms:${phone}?&body=${encodeURIComponent(body)}`,
    email: `mailto:${shop.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
