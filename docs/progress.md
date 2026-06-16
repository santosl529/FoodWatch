# Implementation Progress

Running log of what's been built. See `docs/prd.md` §12 for the build order.

## Step 1 — Foundation (done)

**What was built**
- Scaffolded Next.js 16 (App Router) + React 19 + strict TypeScript + Tailwind v4 via `create-next-app`, into the repo root.
- Initialized shadcn/ui (new-york style, `neutral` base color, CSS variables) with Lucide icons. `components.json` + `lib/utils.ts` (`cn()`) in place. Base components added: `button`, `card`, `input`, `label`, `badge`, `sonner`, `dropdown-menu`, `avatar`, `separator`, `skeleton`.
- `app/globals.css` rewritten with the shadcn neutral theme tokens (light + dark) for Tailwind v4.
- Supabase wiring (new publishable/secret key conventions):
  - `lib/supabase/client.ts` — browser client (publishable key).
  - `lib/supabase/server.ts` — per-request SSR client (publishable key + session cookies, RLS applies as the user). This is the default server client.
  - `lib/supabase/admin.ts` — secret-key client for privileged, RLS-bypassing server ops only; guarded with `server-only`.
  - `lib/supabase/middleware.ts` (`updateSession`) — refreshes the auth session and syncs cookies; no-ops if env vars are unset.
- `proxy.ts` at root (Next 16 renamed the `middleware` convention to `proxy`) calls `updateSession`. Route-protection redirects are intentionally deferred to step 3.
- App shell: `app/layout.tsx` (metadata + Sonner `Toaster`), `components/nav.tsx`, and a placeholder `app/page.tsx`.
- `.env.example` documenting required env vars; `.gitignore` updated to allow committing `.env.example`.
- `supabase/migrations/0001_enable_postgis.sql` — enables PostGIS (foundation for geography columns / distance queries). Tables + RLS land in step 2.
- Added `typecheck` npm script (`tsc --noEmit`).

**Verification**
- `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

**Decisions / deviations**
- `server.ts` uses the **publishable** key + cookies (not the secret key) so RLS applies per-user — required by PRD §8. The secret key is isolated in `admin.ts`. This refines `CLAUDE.md`'s inline comment that described `server.ts` as using the secret key. (Suggested CLAUDE.md clarification pending confirmation.)
- Root request-interception file is `proxy.ts`, not `middleware.ts`, because Next 16 deprecated the `middleware` convention. (CLAUDE.md still lists `middleware.ts`; suggested update pending confirmation.)

**Known issues / open**
- Supabase project + real env values not yet created/wired (need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`).
- MapLibre tile provider and OpenRouter vision model still undecided (PRD §11).
- The Nav "Post food" button links to `/post/new`, which doesn't exist yet (404 until step 4).

**Next**
- Step 2: schema + RLS migrations for all tables in PRD §7, seed test profiles (incl. one admin).
