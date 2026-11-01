export interface CardChargeState {
  /** Result shown under the form: success or why the charge didn't go through */
  message?: string;
  ok?: boolean;
  /** A new key per attempt, so a double-clicked button doesn't charge the card twice */
  nonce: string;
}
