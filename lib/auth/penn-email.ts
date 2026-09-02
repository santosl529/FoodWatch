/**
 * Matches a Penn address: any mailbox at `upenn.edu` or one of its school
 * subdomains (`engineering.upenn.edu`, `sas.upenn.edu`, `wharton.upenn.edu`, …).
 *
 * This mirrors the domain check in `supabase/migrations/0004_auth_hook.sql`.
 * The hook is the enforcing layer — it runs inside Supabase Auth and cannot be
 * bypassed by any client. This copy exists purely so the UI can fail fast with
 * a friendly message instead of a round trip. If the two ever disagree, the
 * hook wins and the user simply sees its error instead of ours.
 */
export const PENN_EMAIL_PATTERN = /^[^@\s]+@(?:[a-z0-9-]+\.)*upenn\.edu$/i;

export function isPennEmail(email: string): boolean {
  return PENN_EMAIL_PATTERN.test(email.trim());
}
