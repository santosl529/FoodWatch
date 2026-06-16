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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_URL — set it in .env.local",
    );
  }
  if (!secretKey) {
    throw new Error(
      "Missing env var SUPABASE_SECRET_KEY — set it in .env.local (server-only, never NEXT_PUBLIC_)",
    );
  }

  return createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
