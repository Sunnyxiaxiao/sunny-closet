/**
 * 订单邮件的内容（纯函数，不发信）：
 *   - newOrderEmail：有人下单 → 发给店主
 *   - orderConfirmedEmail：店主在后台确认订单 → 发给顾客（含付款方式）
 * 邮件统一用英文（和注册、重设密码邮件一致）；商品名给店主用中文名，给顾客用英文名。
 */

import { shop } from "@/config/shop";
import type { FulfillmentMethod } from "@/config/shop";
import { localePath } from "@/i18n/config";
import { handoverText } from "@/lib/booking/schedule";
import { formatDate, type IsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PaymentMethod } from "@/lib/supabase/database.types";
import { sizeLabel } from "@/messages";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface OrderEmailLine {
  /** 中文名（带品牌） */
  name: string;
  /** 英文名（带品牌），没有英文名时等于中文名 */
  nameEn: string;
  size: string;
  start: IsoDate;
  end: IsoDate;
  rentalDays: number;
  rentalCents: number;
  depositCents: number;
  leadDays: number;
  tailDays: number;
}

export interface OrderEmailData {
  bookingNo: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote: string;
  fulfillment: FulfillmentMethod;
  shippingAddress: string | null;
  /** 购物车里的每一件（第 1 件是主订单） */
  lines: OrderEmailLine[];
  /** 加购的头盔套 */
  addOns: { name: string; nameEn: string; cents: number }[];
  /** 运费（已含在 totalCents 里），0 = 包邮或自取 */
  shippingCents: number;
  totalCents: number;
  /**
   * 付款方式（null = 手动流程：后台确认、Zelle / Venmo）、已付金额（null = 还没付）、
   * 留存的卡（例如 "Visa •••• 4242"）、当面收的押金（in_person 才有）
   */
  payment: { method: PaymentMethod | null; paidCents: number | null; card: string | null; cashDepositCents: number };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 一段文字：纯文本一份、HTML 一份，保证两种格式内容一致 */
type Block = { kind: "p"; text: string } | { kind: "rows"; rows: [string, string][] } | { kind: "link"; label: string; url: string };

function render(blocks: Block[]): { text: string; html: string } {
  const text = blocks
    .map((b) =>
      b.kind === "p" ? b.text : b.kind === "rows" ? b.rows.map(([k, v]) => (k ? `${k}: ${v}` : v)).join("\n") : `${b.label}: ${b.url}`,
    )
    .join("\n\n");
  const body = blocks
    .map((b) => {
      if (b.kind === "p") return `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(b.text).replaceAll("\n", "<br>")}</p>`;
      if (b.kind === "link") {
        return `<p style="margin:0 0 16px"><a href="${escapeHtml(b.url)}" style="display:inline-block;background:#171717;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">${escapeHtml(b.label)}</a></p>`;
      }
      const rows = b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#737373;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;white-space:pre-line">${escapeHtml(v)}</td></tr>`,
        )
        .join("");
      return `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px">${rows}</table>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#fff;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px"><div style="max-width:560px;margin:0 auto"><p style="margin:0 0 24px;font-weight:900;letter-spacing:0.2em">SUNNY CLOSET</p>${body}</div></body></html>`;
  return { text, html };
}

const range = (l: OrderEmailLine) => `${formatDate(l.start, "en")} – ${formatDate(l.end, "en")} (${l.rentalDays} ${l.rentalDays === 1 ? "day" : "days"})`;

function itemRows(order: OrderEmailData, language: "zh" | "en"): [string, string][] {
  const multi = order.lines.length > 1;
  const rows: [string, string][] = [];
  order.lines.forEach((l, i) => {
    const name = language === "en" ? l.nameEn : l.name;
    rows.push([multi ? `Item ${i + 1}` : "Item", `${name}\nSize ${sizeLabel(l.size, language)} · ${range(l)}\nRental ${formatMoney(l.rentalCents)}${l.depositCents > 0 ? ` · Deposit ${formatMoney(l.depositCents)}` : ""}`]);
  });
  for (const a of order.addOns) rows.push(["Add-on", `${language === "en" ? a.nameEn : a.name} · ${formatMoney(a.cents)}`]);
  return rows;
}

function handoverRows(order: OrderEmailData): [string, string][] {
  const method =
    order.fulfillment === "pickup"
      ? "In-store pickup"
      : order.shippingCents > 0
        ? `Shipping (${formatMoney(order.shippingCents)})`
        : "Shipping (free)";
  const first = order.lines[0];
  const sameDates = order.lines.every((l) => l.start === first.start && l.end === first.end);
  const handover = (l: OrderEmailLine) =>
    handoverText({ start: l.start, end: l.end }, order.fulfillment, { leadDays: l.leadDays, tailDays: l.tailDays }, "en");
  const rows: [string, string][] = [["Method", method]];
  if (sameDates) rows.push(["Schedule", handover(first)]);
  else order.lines.forEach((l, i) => rows.push([`Item ${i + 1}`, handover(l)]));
  if (order.shippingAddress) rows.push(["Ship to", order.shippingAddress]);
  return rows;
}

const depositOf = (order: OrderEmailData) => order.lines.reduce((sum, l) => sum + l.depositCents, 0);

/** 有人下单：发给店主，提醒去后台确认 */
export function newOrderEmail(order: OrderEmailData, { to, origin }: { to: string; origin: string }): EmailMessage {
  const count = order.lines.length;
  const { text, html } = render([
    {
      kind: "p",
      text: ownerIntro(order),
    },
    { kind: "rows", rows: [["Booking no.", order.bookingNo], ...itemRows(order, "zh")] },
    { kind: "rows", rows: handoverRows(order) },
    {
      kind: "rows",
      rows: [
        ["Customer", order.customerName],
        ["Phone", order.customerPhone],
        ["Email", order.customerEmail],
        ...(order.customerNote ? ([["Note", order.customerNote]] as [string, string][]) : []),
      ],
    },
    {
      kind: "rows",
      rows: [
        [
          "Total",
          `${formatMoney(order.totalCents)}${depositOf(order) > 0 ? ` (incl. ${formatMoney(depositOf(order))} deposit)` : ""}${order.payment.method === "card" && order.payment.paidCents !== null ? " · paid by card" : ""}`,
        ],
      ],
    },
    { kind: "link", label: "Open admin", url: `${origin}/admin?status=${order.payment.method ? "confirmed" : "pending"}` },
  ]);
  return {
    to,
    replyTo: order.customerEmail,
    subject: `New booking ${order.bookingNo} · ${order.customerName} · ${count} ${count === 1 ? "item" : "items"}`,
    text,
    html,
  };
}

/** 新订单通知（给店主）的第一句：按付款方式说明这单确认了没有、钱怎么收 */
function ownerIntro(order: OrderEmailData): string {
  const { method, cashDepositCents, card } = order.payment;
  const due = formatMoney(order.totalCents);
  if (method === "card") return `New booking from ${order.customerName}, paid by card and confirmed automatically.`;
  if (method === "in_person_card") {
    return `New booking from ${order.customerName}, confirmed automatically. Card on file instead of a deposit${card ? ` (${card})` : ""}; they'll pay ${due} in person at pickup.`;
  }
  if (method === "in_person") {
    return `New booking from ${order.customerName}, confirmed automatically. They'll pay ${due} plus a ${formatMoney(cashDepositCents)} deposit in person at pickup.`;
  }
  return `New booking request from ${order.customerName}. It's pending until you confirm it in the admin.`;
}

/** 确认邮件里的付款部分：刷卡已付 / 取件时当面付（留卡或押金）/ 手动流程的应付金额和 Zelle、Venmo */
function paymentBlocks(order: OrderEmailData): Block[] {
  const { method, paidCents, card, cashDepositCents } = order.payment;
  if (method === "card" && paidCents !== null) {
    return [
      { kind: "rows", rows: [["Paid", `${formatMoney(paidCents)}${card ? ` · ${card}` : ""}`]] },
      {
        kind: "p",
        text: "No deposit needed. Your card is kept on file and only charged for late returns, extra cleaning, repairs or loss, as set out in our Rental Terms.",
      },
    ];
  }
  if (method === "in_person_card") {
    return [
      { kind: "rows", rows: [["Due at pickup", `${formatMoney(order.totalCents)} (cash, Zelle or Venmo)`]] },
      {
        kind: "p",
        text: `No deposit needed. Your card${card ? ` (${card})` : ""} is kept on file and only charged for late returns, extra cleaning, repairs or loss, as set out in our Rental Terms.`,
      },
    ];
  }
  if (method === "in_person") {
    return [
      {
        kind: "rows",
        rows: [
          ["Due at pickup", `${formatMoney(order.totalCents)} (cash, Zelle or Venmo)`],
          ["Deposit", `${formatMoney(cashDepositCents)}, paid at pickup and returned in person after the return is checked`],
        ],
      },
    ];
  }
  const deposit = depositOf(order);
  return [
    {
      kind: "rows",
      rows: [
        ["Amount due", formatMoney(order.totalCents)],
        ...(deposit > 0 ? ([["", `Includes a ${formatMoney(deposit)} deposit, refunded after the return is checked.`]] as [string, string][]) : []),
        ["Zelle", shop.payment.zelle],
        ["Venmo", shop.payment.venmo],
      ],
    },
    { kind: "p", text: `Please include your booking number ${order.bookingNo} in the payment note.` },
  ];
}

/**
 * 订单确认：发给顾客。
 * 付款部分见 paymentBlocks：刷卡已付、取件时当面付（留卡或押金），或手动确认的订单（没配置 Stripe）的应付金额和 Zelle / Venmo
 */
export function orderConfirmedEmail(order: OrderEmailData, { origin }: { origin: string }): EmailMessage {
  const { text, html } = render([
    { kind: "p", text: `Hi ${order.customerName},\n\nGood news — your booking ${order.bookingNo} is confirmed and the dates are held for you.` },
    { kind: "rows", rows: itemRows(order, "en") },
    { kind: "rows", rows: handoverRows(order) },
    ...paymentBlocks(order),
    { kind: "link", label: "View your booking", url: `${origin}${localePath("en", `/booking/${order.bookingNo}`)}` },
    {
      kind: "p",
      text: `To keep it private, the booking page opens on the device you booked from, or after you sign in with ${order.customerEmail} (no account yet? sign up with this email).`,
    },
    {
      kind: "p",
      text: `Questions? Just reply to this email, or text us at ${shop.contact.phone}.\n\n— ${shop.name}`,
    },
  ]);
  return {
    to: order.customerEmail,
    replyTo: shop.contact.email,
    subject: `Your ${shop.name} booking ${order.bookingNo} is confirmed`,
    text,
    html,
  };
}
