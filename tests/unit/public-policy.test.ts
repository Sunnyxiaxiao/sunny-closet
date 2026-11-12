import { expect, it } from "vitest";
import { shop } from "../../src/config/shop";
import { getMessages } from "../../src/messages";
import { shippingPolicyArgs } from "../../src/lib/shipping";
import { termsArgs } from "../../src/lib/terms";

it("discloses the exact surcharge states in both storefront languages", () => {
  for (const locale of ["en", "zh"] as const) {
    const m = getMessages(locale);
    const product = m.product.shippingPolicy(...shippingPolicyArgs(2));
    const info = m.rentalInfo.shippingRules(...shippingPolicyArgs(2)).join(" ");
    const terms = JSON.stringify(m.terms.sections(termsArgs(2)));
    for (const state of shop.shipping.farStates) {
      expect(product).toContain(state);
      expect(info).toContain(state);
      expect(terms).toContain(state);
    }
  }
});
it("does not promise every rental is deposit-free or every paid rush order is confirmed", () => {
  const en = getMessages("en");
  const zh = getMessages("zh");
  expect(en.product.rentalNotesBody.join(" ")).toContain("refundable deposit");
  expect(zh.product.rentalNotesBody.join(" ")).toContain("可退押金");
  expect(en.checkout.subtitleAwaiting).toContain("unconfirmed");
  expect(zh.checkout.subtitleAwaiting).toContain("仍待");
  expect(JSON.stringify(en.terms.sections(termsArgs(2)))).toContain("payment does not confirm");
  expect(JSON.stringify(zh.terms.sections(termsArgs(2)))).toContain("付款不代表预订确认");
});
it("takes rush fees and owner response deadline from the operational policy", () => {
  const args = termsArgs(2);
  expect(args.rushFee * 100).toBe(shop.shipping.rushFeeCents);
  expect(args.rushFarFee * 100).toBe(shop.shipping.rushFarFeeCents);
  expect(args.deposit * 100).toBe(shop.payment.inPersonDepositCents);
  expect(args.acceptanceHours).toBe(24);
});
