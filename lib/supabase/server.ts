import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request server Supabase client for use in Server Components, Server
 * Actions, and Route Handlers.
 *
 * Uses the PUBLISHABLE key plus the signed-in user's session cookies, so all
 * queries run under the user's identity and Row-Level Security applies. This is
 * the default server client for the app. For privileged operations that must
 * bypass RLS, use the secret-key admin client in `./admin` instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component. This can be ignored
            // when middleware is refreshing user sessions.
          }
        },
      },
    },
  );
}
