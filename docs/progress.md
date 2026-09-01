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
- Step 3: auth & onboarding — email OTP with server-side `@upenn.edu` enforcement, long-lived sessions, route protection, sign-in page.

---

## Step 2 — Schema & RLS (done)

**What was built**
- `supabase/migrations/0002_schema.sql` — all 7 tables from PRD §7:
  - `profiles` (= auth user, with `role` check constraint: `student | admin`)
  - `posts` (PostGIS `geography(Point, 4326)` for location + GiST index; status + last_activity_at indexes)
  - `comments`
  - `availability_events` (partial unique index: one `gone_report` per user per post, per PRD §6.1)
  - `notification_preferences`
  - `push_subscriptions`
  - `notifications`
- Two DB-level triggers enforcing business rules that RLS alone can't express:
  - `prevent_role_change` on `profiles` — non-admin users cannot elevate their own `role`; admin-client calls (null `auth.uid()`) are allowed through.
  - `check_post_update_permissions` on `posts` — only the creator may change `description`, `photo_path`, or `bumped_at`; any student may update crowd-sourced fields; admin-client calls allowed through.
- `handle_new_user` trigger on `auth.users` — auto-creates a `profiles` row on signup.
- `supabase/migrations/0003_rls.sql` — RLS enabled on all tables (default-deny). Policies per PRD §8:
  - `profiles`: authenticated read-all; own insert/update (role change blocked by trigger).
  - `posts`: authenticated read-all; authenticated insert (as self); authenticated update-all (field guard in trigger); creator-only delete (admin deletes use admin client, bypassing RLS).
  - `comments`: authenticated read/insert; author-only delete.
  - `availability_events`: authenticated read/insert; no update or delete (append-only log).
  - `notification_preferences`, `push_subscriptions`, `notifications`: own-row read/write only. `notifications` has no user INSERT policy — rows are created server-side via the admin client.
- `supabase/seed.sql` — two test users (`student@upenn.edu`, `admin@upenn.edu`) with the admin role set directly in the DB. Local-dev: insert via `supabase db reset`; remote: create via Supabase dashboard then apply the UPDATE statements.

**Verification**
- SQL reviewed for correctness; no Next.js build changes in this step (pure DB migration).
- Migrations `0002` and `0003` applied against the live Supabase project (via the dashboard SQL editor) with no errors.
- Verified over the REST API with the publishable key that all 7 tables exist and return no rows to an unauthenticated caller. Note: an empty table returns `[]` regardless of RLS, so this confirms existence, not enforcement — RLS is genuinely exercised once step 3 provides a real session.

**Decisions / deviations**
- Field-level write restrictions on `posts` are enforced via a `BEFORE UPDATE` trigger rather than separate RLS policies, because Postgres RLS operates at row granularity, not column granularity.
- `notifications` intentionally has no user-INSERT RLS policy — only the server-side admin client inserts notification rows (when posts/comments are created). This avoids user-forgeable notifications.
- The partial unique index on `availability_events` (`where type = 'gone_report'`) satisfies PRD §6.1's "one user's gone_report per post counts once" at the DB level, allowing multiple `servings_update` events per user per post.
- Admin-client operations (`auth.uid() IS NULL`) are explicitly allowed through both triggers; attempting DB-level enforcement using admin identity would require a separate role, which is unnecessary complexity for this MVP scale.
