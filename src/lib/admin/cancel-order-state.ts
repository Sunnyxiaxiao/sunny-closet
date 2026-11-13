export interface CancelOrderState {
  /** Result shown next to the buttons: done, or why the order / the refund didn't go through */
  message?: string;
  ok?: boolean;
}
