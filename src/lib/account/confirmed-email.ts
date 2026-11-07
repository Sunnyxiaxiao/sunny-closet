/**
 * The signed-in user's email, only once it's confirmed (lower case), else null.
 * Guest orders are matched to an account by this email, so it must be proven to belong to the user:
 * the Auth server's user record (getUser()) says when it was confirmed; the session token alone doesn't.
 */
export function confirmedEmail(user: { email?: string | null; email_confirmed_at?: string | null } | null): string | null {
  const email = user?.email?.trim().toLowerCase();
  return email && user?.email_confirmed_at ? email : null;
}
