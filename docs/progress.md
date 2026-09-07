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

---

## Step 3 — Auth & onboarding (in progress)

### 3a — `@upenn.edu` auth hook (done)

**What was built**
- `supabase/migrations/0004_auth_hook.sql`:
  - `hook_restrict_signup_by_email_domain(event jsonb)` — a Supabase **Before User Created** hook enforcing the Penn domain gate. Accepts `upenn.edu` and any subdomain (`engineering.upenn.edu`, `sas.upenn.edu`, `wharton.upenn.edu`, …); denies everything else, including emailless (phone/anonymous) signups. `execute` granted to `supabase_auth_admin` only, revoked from `anon`/`authenticated`/`public`.
  - `handle_new_user` updated to default `display_name` to the email local-part, per PRD §11's low-friction lean. Living in the trigger means a future iOS client inherits it for free.
- `supabase/seed.sql` reworked (see gotcha below).

**Verification**
- Deny path: raw `POST /auth/v1/otp` with the publishable key for an `example.com` address → `403` with the custom message, no user created. This bypasses all app code, which is the point of enforcing at the auth boundary rather than in a server action.
- Allow path: same call for `santos7@engineering.upenn.edu` → `200`; user created, visible to the Auth admin API, with a `profiles` row auto-created by the trigger and `display_name` = `santos7`, `role` = `student`.

**Decisions / deviations**
- Subdomain wildcard (`%.upenn.edu`) rather than an explicit school list: Penn issues addresses under more subdomains than are worth tracking, only Penn controls DNS under `upenn.edu`, and the `LIKE` is end-anchored so `upenn.edu.attacker.com` does not match. This widens the PRD's literal `@upenn.edu` wording — confirmed with the product owner.
- The hook is a Postgres function, not an Edge Function: no extra deploy surface, and the Before User Created hook supports both.

**Known issues / gotchas**
- ⚠️ **Never hand-write `auth.users` rows on a remote project.** The original seed inserted rows without `instance_id`; Postgres accepted them, but GoTrue filters on `instance_id`, so the users were invisible to the Auth admin API and could not have signed in. Symptom: `profiles` has rows (FK-valid) while `/auth/v1/admin/users` returns `[]`. Fix was to delete them and let Supabase create users properly. `seed.sql` now sets `instance_id` + empty-string token columns for local use, and its remote path is an email-matched `UPDATE` only.
- Auth Hooks is marked BETA in the Supabase dashboard.
- Email auto-confirm appears to be enabled on the project (`email_confirmed_at` set at creation). Harmless for the gate — a session still requires OTP verification — but relevant to 3b.

**Next**
- 3b: `/signin` page + `app/actions/auth.ts` (send/verify OTP, sign out).

### 3b — Sign-in page + auth server actions (done)

**What was built**
- `lib/auth/penn-email.ts` — `PENN_EMAIL_PATTERN` / `isPennEmail`, mirroring the SQL domain check. Explicitly documented as cosmetic: the auth hook is the enforcing layer, and if the two ever diverge the hook wins.
- `app/actions/auth.ts` — `sendOtp`, `verifyOtp`, `signOut`, Zod-validated and shaped for `useActionState`. `verifyOtp` rewrites Supabase's "Token has expired or is invalid" into plainer language and keeps the user on the code step. `signOut` redirects to `/signin`.
- `app/signin/signin-form.tsx` — client component, two-step flow (email → emailed code). "Use a different email" remounts the flow via `key`, since `useActionState` has no reset. Code input accepts GoTrue's 6–10 digit range (`lib/auth/otp-token.ts`), not a hardcoded 6.
- `app/signin/page.tsx` — server component; redirects to `/` if a session already exists.
- `zod` promoted from a transitive dependency to a direct one in `package.json`.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build` all pass. `/signin` builds as a dynamic route.
- Dev-server smoke test: `GET /signin` returns 200 and renders the expected fields.
- Follow-up fix: `app/actions/auth.ts` initially exported `initialSignInState`, which a `"use server"` module may not do (async functions only). It surfaced only when the page was actually requested in dev — `npm run build` passed and an early smoke test returned 200, so neither caught it. Shared state now lives in `lib/auth/sign-in-state.ts`. Re-verified against a cold-start dev server.
- Follow-up: OTP length is the shared 6–10 range in `lib/auth/otp-token.ts` (this project issues 8). `verifyOtp` stays `type: "email"`. End-to-end sign-in with an emailed code confirmed.

**Decisions / deviations**
- Plain `Input` for the code field rather than shadcn's `input-otp` component, to avoid pulling in another dependency for one screen. `inputMode="numeric"` + `autoComplete="one-time-code"` still gives iOS/Android autofill from the SMS/email code.
- Two `useActionState` hooks (one per action) rather than a single branching action, so each step keeps its own error state.

**Known issues / pending**
- Post-verification redirect goes to `/`, since `/feed` does not exist until step 5.
