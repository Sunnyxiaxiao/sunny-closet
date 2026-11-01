import { shop } from "@/config/shop";

/**
 * Rental terms (/terms): the text lives in the messages (zh-CN.ts / en.ts → terms);
 * the numbers it quotes come from here, so they always match what checkout charges.
 */

/** One block of a section: a paragraph, a bulleted list, or a table */
export type TermsBlock =
  | string
  | { readonly list: readonly string[] }
  | { readonly table: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] } };

export interface TermsSection {
  title: string;
  blocks: TermsBlock[];
}

export interface TermsArgs {
  /** Shortest shipped rental (admin setting) */
  shippingMinDays: number;
  freeSetMinDays: number;
  /** In dollars */
  freeSubtotal: number;
  fee: number;
  farFee: number;
  deposit: number;
  lateSet: number;
  latePiece: number;
  lateAccessory: number;
  email: string;
}

export function termsArgs(shippingMinDays: number): TermsArgs {
  const s = shop.shipping;
  return {
    shippingMinDays,
    freeSetMinDays: s.freeSetMinDays,
    freeSubtotal: s.freeSubtotalCents / 100,
    fee: s.feeCents / 100,
    farFee: s.farFeeCents / 100,
    deposit: shop.payment.inPersonDepositCents / 100,
    lateSet: shop.lateFees.setCents / 100,
    latePiece: shop.lateFees.pieceCents / 100,
    lateAccessory: shop.lateFees.accessoryCents / 100,
    email: shop.contact.email,
  };
}
