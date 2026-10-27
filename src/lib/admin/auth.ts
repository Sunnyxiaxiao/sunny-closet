import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Single entry point for admin: call it at the start of every admin page and admin action.
 * Not signed in → sign-in page; signed in but not on the admin list → sign-in page with a message.
 * The returned supabase client carries the admin's session, so queries are still subject to database RLS.
 */
export async function requireAdmin() {
  // Supabase reads the current time when validating the session, so this must run at request time, not during prerendering
  await connection();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login?error=forbidden");

  return { supabase, user };
}
