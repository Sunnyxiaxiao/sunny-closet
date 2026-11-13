import { dismissOrderEmail, resendOrderEmail } from "@/app/admin/actions";
import { MAX_AUTO_ATTEMPTS } from "@/lib/email/delivery";
import type { EmailKind } from "@/lib/supabase/database.types";

const KIND_LABEL: Record<EmailKind, string> = {
  new_order: "新订单通知（给你）",
  order_confirmed: "订单确认邮件（给顾客）",
  refund_due: "待退款提醒（给你）",
  awaiting_acceptance: "已付款、等你接单（给顾客）",
  order_declined: "拒单通知（给顾客）",
  acceptance_reminder: "接单提醒（给你）",
  pickup_reminder: "取件提醒（给顾客）",
  return_reminder: "归还提醒（给顾客）",
  order_cancelled: "订单取消通知（给顾客）",
};

export interface UnsentEmail {
  id: string;
  bookingNo: string;
  kind: EmailKind;
  attempts: number;
  lastError: string | null;
}

/** 后台顶部：没发出去的订单邮件（定期任务会自动重试几次），可以重发或者标为不用发了 */
export function AdminEmailAlerts({ emails }: { emails: UnsentEmail[] }) {
  if (emails.length === 0) return null;
  return (
    <div className="mt-4 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-semibold">有 {emails.length} 封订单邮件没发出去</p>
      <ul className="mt-2 space-y-2">
        {emails.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {e.bookingNo} · {KIND_LABEL[e.kind]} · 已试 {e.attempts} 次
              {e.attempts < MAX_AUTO_ATTEMPTS ? "，会自动重试" : ""}
            </span>
            {e.lastError && <span className="text-xs text-red-700">（{e.lastError}）</span>}
            <span className="flex gap-2">
              <form action={resendOrderEmail}>
                <input type="hidden" name="emailId" value={e.id} />
                <button type="submit" className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-bold text-white hover:bg-neutral-700">
                  重发
                </button>
              </form>
              <form action={dismissOrderEmail}>
                <input type="hidden" name="emailId" value={e.id} />
                <button type="submit" className="rounded-full border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100">
                  不用发了
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
