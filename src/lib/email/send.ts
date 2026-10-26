import "server-only";
import nodemailer from "nodemailer";
import { shop } from "@/config/shop";
import type { EmailMessage } from "@/lib/email/templates";

/**
 * 发邮件：用店铺 Gmail 的 SMTP（和 Supabase 注册 / 重设密码邮件同一个邮箱，免费，每天约 500 封）。
 * 需要在 .env.local（以及上线平台的环境变量）里填：
 *   SMTP_USER  店铺 Gmail 地址
 *   SMTP_PASS  Gmail 的 16 位“应用专用密码”（不是登录密码）
 * 可选：SMTP_HOST / SMTP_PORT（默认 smtp.gmail.com:465）、ADMIN_NOTIFY_EMAIL（新订单通知发给谁，默认联系邮箱）。
 * 没配置时不发信、只在日志里提示；发信失败也不影响下单和改状态。
 */

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** 新订单通知发给谁 */
export function adminNotifyEmail(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || shop.contact.email;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) {
    console.warn(`[email] 没有配置 SMTP_USER / SMTP_PASS，跳过发信：${message.subject}`);
    return false;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: { name: shop.name, address: process.env.SMTP_USER! }, ...message });
    return true;
  } catch (error) {
    console.error(`[email] 发送失败：${message.subject}`, error);
    return false;
  }
}
