import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the publishable key only — never the secret key.
 * Safe to import in Client Components.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_URL — set it in .env.local",
    );
  }
  if (!publishableKey) {
    throw new Error(
      "Missing env var NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — set it in .env.local",
    );
  }

  return createBrowserClient(url, publishableKey);
}
