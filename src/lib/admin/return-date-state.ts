export interface ReturnDateState {
  message?: string;
  ok?: boolean;
  /** The date would hold the piece into these orders: shown first, saved only after the admin confirms */
  conflicts?: string[];
  /** The date the admin tried to save (kept for the confirm step) */
  date?: string;
}
