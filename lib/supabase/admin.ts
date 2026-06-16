import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client backed by the SECRET key. This BYPASSES Row-Level
 * Security, so use it only for trusted server-side operations that genuinely
 * need elevated access (e.g. the @upenn.edu auth-boundary check, admin
 * moderation deletes, seeding). Never import this into client code — the
 * `server-only` guard above will fail the build if you try.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
