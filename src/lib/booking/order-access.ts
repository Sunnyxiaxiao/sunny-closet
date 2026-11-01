import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hasAuthCookie } from "@/lib/account/customer";
import { getSecretKey } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who can open an order page (and act on it: pay, save a card, write a review):
 *   - the browser that placed the order (a signed, httpOnly cookie listing its orders), so guests can follow their order right away;
 *   - the account that placed it, or an account whose confirmed email is the order's email (guests sign up / sign in with it);
 *   - the admin.
 * Knowing the order number alone (e.g. a forwarded email link) is not enough.
 */

const COOKIE = "sc_orders";
/** Orders remembered per browser (oldest dropped first) */
const MAX_ORDERS = 20;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function signature(payload: string): Buffer {
  // A key of its own, derived from the server secret, so this cookie can't be forged without it
  const key = createHash("sha256").update(`sunny-closet:order-access:${getSecretKey()}`).digest();
  return createHmac("sha256", key).update(payload).digest();
}

/** Order ids from this browser's cookie; an unsigned or tampered cookie counts as none */
async function ordersInBrowser(): Promise<string[]> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return [];
  const [payload, mac] = value.split("~");
  if (!payload || !mac) return [];
  const given = Buffer.from(mac, "base64url");
  const expected = signature(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return [];
  return payload.split(".");
}

/** Lets this browser open the order from now on (call from a server action or route handler, where cookies can be set) */
export async function rememberOrderInBrowser(bookingId: string): Promise<void> {
  const ids = [...(await ordersInBrowser()).filter((id) => id !== bookingId), bookingId].slice(-MAX_ORDERS);
  const payload = ids.join(".");
  (await cookies()).set(COOKIE, `${payload}~${signature(payload).toString("base64url")}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export type OrderAccess = "allowed" | "signed_out" | "other_account";

/** Whether the current visitor may open this (main) order; "signed_out" / "other_account" tell the page what to suggest */
export async function orderAccess(order: { id: string; user_id: string | null; customer_email: string }): Promise<OrderAccess> {
  if ((await ordersInBrowser()).includes(order.id)) return "allowed";
  if (!(await hasAuthCookie())) return "signed_out";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "signed_out";
  if (order.user_id === user.id) return "allowed";
  if (user.email_confirmed_at && user.email?.toLowerCase() === order.customer_email.toLowerCase()) return "allowed";
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin ? "allowed" : "other_account";
}
