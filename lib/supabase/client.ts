import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses the publishable key only — never the secret key.
 * Safe to import in Client Components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
