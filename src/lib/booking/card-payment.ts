/**
 * Card payments (pure helpers, no Stripe calls).
 * Customers pay by card at checkout; the card is saved and the admin can later charge it for serious damage or loss
 * (at retail price) or a late return. There is no deposit.
 */

/** "visa", "4242" → "Visa •••• 4242" */
export function cardLabel(brand: string, last4: string): string {
  return `${brand.charAt(0).toUpperCase()}${brand.slice(1)} •••• ${last4}`;
}

/** Dollar amount typed in the admin form ("25" or "25.50") → cents; null when it isn't a positive amount with at most 2 decimals */
export function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return cents > 0 ? cents : null;
}
