export interface CardChargeState {
  /** Result shown under the form: success or why the charge didn't go through */
  message?: string;
  ok?: boolean;
  /**
   * Key of the charge this form submits (also its Stripe idempotency key, stored with the charge): a double submit
   * finds the charge already recorded instead of starting another. A new one is handed out once a charge has a result
   */
  nonce: string;
}
