import { addDays, compareDates, daysBetween, type IsoDate } from "@/lib/dates";

/**
 * A picked-up order that isn't back yet: how late it is and until when it holds its piece.
 * Mirrors public.booking_hold_range (migration 20261103000027), which is what availability actually uses.
 */
export interface OverdueInfo {
  /** Days past the scheduled return day (0 = not late) */
  lateDays: number;
  /** Last day the piece is held, cleaning days included; null = only its booked dates */
  holdUntil: IsoDate | null;
  /** The admin's expected return date is what's holding it */
  byExpectedReturn: boolean;
}

export function overdueInfo(
  booking: {
    status: string;
    end_date: string;
    tail_days: number;
    buffer_days: number;
    expected_return_date: string | null;
  },
  today: IsoDate,
  holdDays: number,
): OverdueInfo | null {
  if (booking.status !== "picked_up") return null;
  const returnDay = addDays(booking.end_date, 1 + booking.tail_days);
  const lateDays = Math.max(0, daysBetween(returnDay, today));
  const booked = addDays(returnDay, booking.buffer_days - 1);
  const later = (date: IsoDate) => (compareDates(date, booked) > 0 ? date : booked);

  if (booking.expected_return_date && compareDates(booking.expected_return_date, today) >= 0) {
    return { lateDays, holdUntil: later(addDays(booking.expected_return_date, booking.buffer_days)), byExpectedReturn: true };
  }
  if (lateDays > 0) return { lateDays, holdUntil: later(addDays(today, holdDays)), byExpectedReturn: false };
  return null;
}
