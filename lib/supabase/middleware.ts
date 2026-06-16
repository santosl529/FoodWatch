import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on each request and keeps the session
 * cookies in sync between the request and response.
 *
 * Route protection (redirecting unauthenticated users to /signin) is added in
 * the auth step (build order step 3); for now this only refreshes the session.
 *
 * If Supabase env vars are not yet configured, this is a no-op so the scaffold
 * runs out of the box.
 */
export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: avoid running code between createServerClient and getUser; it
  // refreshes the auth token and writes the updated session cookies.
  await supabase.auth.getUser();

  // TODO (step 3 — auth): redirect unauthenticated users to /signin here.

  return supabaseResponse;
}
