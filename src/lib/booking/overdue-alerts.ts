import type { IsoDate } from "@/lib/dates";

export interface OverdueConflict {
  lateBookingNo: string;
  itemCode: string;
  holdUntil: IsoDate;
  bookingId: string;
  bookingNo: string;
  startDate: IsoDate;
  alertedAt: string | null;
}

/**
 * Part of the scheduled sweep: emails the owner once about each upcoming order that a piece still out with an overdue
 * order runs into, then marks those orders alerted (so the next run doesn't email again). Nothing about the orders changes.
 * Database and email come in as `deps` (tests: tests/unit/overdue-alerts.test.ts).
 */
export async function alertOverdueConflicts(deps: {
  list: () => Promise<OverdueConflict[]>;
  send: (conflicts: OverdueConflict[]) => Promise<void>;
  markAlerted: (bookingIds: string[]) => Promise<void>;
}): Promise<{ alerted: number }> {
  const fresh = (await deps.list()).filter((c) => !c.alertedAt);
  if (fresh.length === 0) return { alerted: 0 };
  await deps.send(fresh);
  const ids = [...new Set(fresh.map((c) => c.bookingId))];
  await deps.markAlerted(ids);
  return { alerted: ids.length };
}
