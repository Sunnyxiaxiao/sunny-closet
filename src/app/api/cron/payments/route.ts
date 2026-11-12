import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sweepAcceptance } from "@/lib/booking/acceptance-server";
import { notifyOverdueConflicts, retryFailedEmails, sendDueReminders } from "@/lib/email/order-notifications";
import { publicOrigin } from "@/lib/site-url";
import { stripeEnabled, sweepWaitingOrders } from "@/lib/stripe";

/**
 * The sweep, called every hour by the scheduled function netlify/functions/payment-sweep.mts:
 *   - payments (with Stripe): orders still waiting on Stripe after their payment window are confirmed if paid, or
 *     cancelled (dates released) if their page expired or never opened. Backup for the webhook, which normally does this right away;
 *   - short-notice shipping orders waiting for the owner: a reminder, then declined automatically after 24 hours;
 *   - overdue pieces: emails the owner once about each upcoming order a piece that hasn't come back runs into;
 *   - reminders to customers: on pickup day (local pickup) and on the last ski day (how to return), once each;
 *   - order emails that failed to send: tried again, a few times at most (src/lib/email/delivery.ts).
 * Needs CRON_SECRET (the same value in the scheduled function's environment); without it the route is off.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const payments = stripeEnabled() ? await sweepWaitingOrders() : null;
  const acceptance = await sweepAcceptance().catch((error: Error) => {
    console.error("[cron] 急单超时处理失败", error);
    return { error: error.message };
  });
  const origin = await publicOrigin();
  const overdue = await notifyOverdueConflicts(origin).catch((error: Error) => {
    console.error("[cron] 逾期冲突提醒失败", error);
    return { error: error.message };
  });
  const reminders = await sendDueReminders(origin).catch((error: Error) => {
    console.error("[cron] 取件 / 归还提醒失败", error);
    return { error: error.message };
  });
  const emails = await retryFailedEmails(origin).catch((error: Error) => {
    console.error("[cron] 重发邮件失败", error);
    return { error: error.message };
  });
  return NextResponse.json({ payments, acceptance, overdue, reminders, emails }, { headers: { "Cache-Control": "no-store" } });
}
