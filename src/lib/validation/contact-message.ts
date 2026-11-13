import { z } from "zod";

/** The contact page's message form. Limits keep one message readable and the form useless for sending bulk mail */
export const CONTACT_LIMITS = { name: 60, email: 120, message: 2000 } as const;

export type ContactField = "name" | "email" | "message";
export type ContactMessage = Record<ContactField, string>;

const schema = z.object({
  name: z.string().trim().min(1).max(CONTACT_LIMITS.name),
  email: z.string().trim().toLowerCase().max(CONTACT_LIMITS.email).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  message: z.string().trim().min(1).max(CONTACT_LIMITS.message),
});

/** The cleaned message, or which fields are wrong (the caller words the errors in the visitor's language) */
export function parseContactMessage(
  input: Record<string, string>,
): { ok: true; message: ContactMessage } | { ok: false; fields: ContactField[] } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, message: parsed.data };
  return { ok: false, fields: [...new Set(parsed.error.issues.map((issue) => issue.path[0] as ContactField))] };
}
