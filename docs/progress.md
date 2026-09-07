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
- ⚠️ **Email deliverability is a launch blocker.** Sending from Resend's shared `onboarding@resend.dev` has no domain alignment, and Penn's filter put the sign-in code straight into spam. Every student hits this on their very first interaction, before they ever see a post. Fixing it needs a purchased domain verified in Resend (SPF/DKIM), then swapping the SMTP sender. Tracked as required before any real rollout.
- Supabase gates **email-template editing behind configured custom SMTP** — not behind a paid plan, as first assumed. Until SMTP is set up the dashboard silently uses default templates, so `{{ .Token }}` cannot be added and no code appears in the email.
- Supabase's built-in SMTP only delivers to addresses on the project's org team, at 2 messages/hour. Fine for solo development, unusable for real users.
- **OTP length is a project setting, not a constant** (`GOTRUE_MAILER_OTP_LENGTH`, 6-10; this project issues 8). Hardcoding 6 in `maxLength` truncated correct codes and produced a misleading "incorrect or expired" error. Diagnosed by minting a token with `admin/generate_link`, which sidesteps email entirely — a good technique for isolating auth bugs from delivery problems.

### 3e — Nav with signed-in user (done)

**What was built**
- `components/nav.tsx` is now an async server component: reads the session, looks up `display_name` from `profiles`, and shows either the account menu + "Post food" or a "Sign in" button.
- `components/user-menu.tsx` — client component with an avatar dropdown showing display name + email, and a sign-out item.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build` pass. `/` is now a dynamic route, as expected once the nav reads the session.
- ⚠️ The dropdown itself is client-side and has **not** been clicked in a browser. Earlier in this step a client-only error passed both a successful build and a `curl` smoke test, so "compiles and renders" is not evidence the menu works — sign-out needs a manual click to be considered verified.

**Decisions / deviations**
- Sign-out calls the server action inside a `useTransition` rather than wrapping the menu item in a `<form>`: Radix closes the menu on select, which can unmount a form before it submits.

**Deferred**
- 3c (route protection) is intentionally skipped for now, at the product owner's request, so development doesn't require a session on every route. It is ~20 lines in `lib/supabase/middleware.ts` when wanted.
- 3d (long-lived sessions) is dashboard-only: confirm "Time-box user sessions" and "Inactivity timeout" are off under Authentication → Sessions.

---

## Step 4 — Post creation, manual (code done; migration not yet applied)

**What was built**
- `supabase/migrations/0005_storage.sql` — `post-photos` bucket (public read, 5 MB cap, image MIME allowlist) plus `storage.objects` policies. Path convention is `<user_id>/<uuid>.<ext>`; the insert/update/delete policies check that first segment against `auth.uid()`.
- `lib/posts/tags.ts` — PRD §9 taxonomy as `as const` arrays plus a Zod enum, labels, and UI groupings. Shared so the step-7 classifier gets the same closed set and cannot invent tags.
- `app/actions/posts.ts` — `createPost`: validates with Zod, uploads the photo, inserts the row as the signed-in user (so RLS applies), and removes the orphaned photo if the insert fails.
- `app/post/new/post-form.tsx` + `page.tsx` — photo capture with preview, description, servings, geolocation capture, building label, and tag chips. The page guards itself since 3c is deferred.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build` pass; `/post/new` builds as a dynamic route.
- ⚠️ **Nothing exercised end-to-end** — `0005_storage.sql` has not been applied, so the bucket does not exist and any upload will fail. No post has been created.

**Decisions / deviations**
- Public bucket rather than private + signed URLs: photo URLs are embedded in feed cards, the map, and post detail, so signing every URL on every render is a lot of machinery for photos of free food in public campus spaces. Writes stay restricted to the uploader's own folder.
- Plain `<textarea>` styled to match `Input` rather than adding shadcn's `textarea` component, to keep the component surface small.
- Tag chips are toggle buttons backed by hidden inputs rather than checkboxes — larger touch targets, and it keeps the form a plain uncontrolled submit.

**Follow-up fix — photo uploads bypass the Server Action**
- Submitting a real phone photo failed with `Body exceeded 1 MB limit`: Next caps a Server Action body at 1 MB, and Vercel caps request bodies at 4.5 MB, so raising the Next limit would only have moved the failure to production.
- The browser now uploads directly to Storage with its own authenticated Supabase client and passes only the resulting path to `createPost`. The photo never transits the Next server.
- The path is client-supplied, so the action validates it against `^<user id>/<uuid>.<ext>$`. The actual guarantee is the storage policy from 0005 — a user can only write under their own folder — while MIME type and the 5 MB cap are enforced by the bucket.
- Upload starts as soon as a photo is chosen rather than on submit, overlapping the transfer with the rest of the form to protect the ~15s posting budget. Submit stays disabled until it finishes.
- The first attempt at this fix was incomplete and the 1 MB error persisted: the file input still carried `name="photo"`, so the browser kept serializing the whole file into the action payload even though `createPost` no longer read it. The photo was effectively uploaded twice — once correctly to Storage, once uselessly into the Server Action body. A file input must be **unnamed** for this pattern to work.
- Known wrinkle: abandoning the form after choosing a photo leaves an orphaned object in the bucket. Not addressed; worth a cleanup job or a `created_at`-based sweep if it becomes real.

**Known issues / pending**
- ⚠️ **Location permission is effectively required.** `latitude`/`longitude` are non-null in the schema and there is no manual coordinate entry, so a student who denies location cannot post at all. PRD §6.4 expects a MapLibre pin as the alternative, but the tile provider is still undecided (§11), so that lands in step 6. Until then this is a real gap, not a styling nit.
- Post-create redirects to `/`, since `/post/[id]` and the feed arrive in step 5.
- HEIC previews may not render in all browsers; the upload itself is unaffected.
