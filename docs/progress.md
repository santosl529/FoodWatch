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
- ✅ **Verified end-to-end.** A real post was created through the form: row present with correct description, servings, status, label and tags; photo stored under `<user id>/`, matching the storage policy; anonymous read of `posts` returns `[]` with a real row present (stronger RLS evidence than the earlier empty-table check).
- Stored coordinates decode to 39.9539, -75.2021 — Penn campus, confirming longitude/latitude order in the EWKT string is correct. This is worth re-checking after any change to the location code: a swap is silent and puts every pin in the wrong hemisphere.

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
- ✅ **RESOLVED in 6b.** Location permission was effectively required — a student who denied it could not post, since `posts.location` is non-null and there was no manual entry. The `LocationPicker` (tap the map or drag the pin) is now the documented §6.4 alternative.
- Post-create redirects to `/`, since `/post/[id]` and the feed arrive in step 5.
- ✅ RESOLVED in 9b: HEIC previews are fixed by client-side re-encoding to JPEG.

---

## Step 5 — Feed, detail, comments, availability lifecycle

### 5a — Lifecycle triggers + feed ranking RPC (done)

**What was built**
- `supabase/migrations/0006_lifecycle.sql`:
  - `gone_report_threshold()` = 2 and `post_max_age()` = 3 hours as inlined constant functions, so the PRD §6.1 tunables live in one documented place.
  - `apply_post_close_rules` — BEFORE UPDATE on `posts`, closes with `zero_servings` when servings hit 0. Mutates NEW rather than issuing a second UPDATE, so there is no recursion and every path that changes servings is covered.
  - `handle_availability_event` — AFTER INSERT on `availability_events`, the single entry point for crowd actions: applies servings updates, records bumps, and closes with `crowd_reports` once distinct gone-reports reach the threshold.
  - `touch_post_on_comment` — comments count as activity (§6.1).
  - `feed_posts(user_lat, user_lng)` — §6.3 ranking with PostGIS distance, plus lazy MAX_AGE filtering.
  - `comments` added to the `supabase_realtime` publication.
- `test/lifecycle.test.mjs` + `npm test` — Node's built-in runner, no new dependency.

**Verification**
- ✅ All 10 tests pass against the live project, covering every close rule in §6.1 plus ranking behaviour. Fixtures create and delete their own users and posts; confirmed nothing left behind.
- The distance test asserts a closer post outranks an equally-aged farther one, which would fail loudly if longitude/latitude were ever transposed in the RPC rather than silently mis-ordering the feed.

**Decisions / deviations**
- **Availability events are the source of truth.** Clients insert an event; triggers apply the consequence to `posts`. One statement per action, atomic close rules, and the append-only RLS on the table stays meaningful.
- **Security fix found while writing this.** `availability_events` RLS only checks `user_id = auth.uid()`, so any student could have inserted a `bump` row and re-surfaced someone else's post — routing around the creator-only rule `check_post_update_permissions` enforces on `posts.bumped_at`. The trigger now rejects a bump from anyone but the creator.
- **Rule (d) is lazy, not scheduled.** `feed_posts` filters on `last_activity_at`, so stale posts vanish with no job latency and no pg_cron dependency. Such rows keep `status='active'` until touched; a sweep can tidy that later if it matters.
- Tests are integration tests against the real project by necessity — the logic under test is Postgres triggers, so a mocked unit test would verify nothing. They use the secret key for fixtures, which bypasses RLS; the triggers do not depend on `auth.uid()`, so the rules exercised are the real ones. RLS itself is not what these cover.

### 5b — Ranked feed at `/` (done, pending browser check)

**What was built**
- `app/page.tsx` — the feed replaces the step-1 placeholder. Server-renders `feed_posts` with null coordinates so there is no blank screen and no permission prompt before first paint. Guards itself (3c deferred).
- `app/feed-list.tsx` — client component that asks for location once, then re-fetches the same RPC with coordinates so distance joins the ranking. Declining leaves the recency-only ordering, which is the §6.3 fallback.
- `components/post-card.tsx` — photo, description, servings, location + distance, comment count, tags. Allergen (`contains-*`) tags sort first since those are what people scan for.
- `lib/posts/feed.ts` — `FeedPost` type mirroring the RPC, public photo URL helper, relative time, distance formatting.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- ⚠️ Not yet loaded in a browser. The location re-fetch is client-side, and this project has repeatedly shown that a green build says nothing about client behaviour.

**Decisions / deviations**
- Plain `<img>` rather than `next/image`: the latter needs the Supabase storage hostname added to `next.config.ts`, and config changes are the owner's call. Worth doing — it would give automatic resizing for phone photos, which is most of what Cloudinary was being considered for.
- Two lint errors (`react-hooks/set-state-in-effect`) were fixed properly rather than suppressed: prop-to-state resync now happens during render (React's documented pattern), and the "asked for location once" guard is a ref rather than state.

### 5c — Post detail + realtime comments (done, pending browser check)

**What was built**
- `app/post/[id]/page.tsx` — full photo, description, servings, location, age, creator, tags. Shows **closed** posts too, with an explanation derived from `close_reason`, rather than 404ing: a link shared into a group chat should say the food is gone.
- `app/post/[id]/comments.tsx` — thread with a Supabase Realtime subscription on `comments` filtered by `post_id`.
- `app/actions/comments.ts` — `addComment`, Zod-validated, inserting as the signed-in user.
- `lib/posts/comment-state.ts`, plus `embeddedDisplayName` in `lib/posts/feed.ts`.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- ⚠️ Realtime is entirely client-side and unverified. Proving it needs the same post open in two browsers — a green build says nothing here.

**Decisions / deviations**
- The realtime handler **refetches the thread** rather than appending the payload row. The payload carries only the raw `comments` row with no joined author name, and at a few comments per post a refetch is cheaper than patching one row and separately resolving its author.
- `addComment` does not touch `last_activity_at`; the `comment_touches_post` trigger from 0006 owns that. Doing it in both places would duplicate the rule and race with itself.
- `embeddedDisplayName` handles both object and array shapes instead of casting. PostgREST types a to-one embed as an array, and casting it away would break the day an embed genuinely is a list.

### 5d — Availability controls + event-only guard (done)

**What was built**
- `supabase/migrations/0007_lifecycle_guard.sql` — closes a real hole in the step-2 design (below). Adds a `creator_close` event type, an `app.in_lifecycle` marker set by the lifecycle functions, and a guard trigger rejecting direct user writes to `status`, `closed_at`, `close_reason`, `servings_remaining`, `bumped_at`, `last_activity_at`.
- `app/actions/availability.ts` — `reportGone`, `setServings`, `bumpPost`, `closePost`. All insert events; none writes to `posts`.
- `components/availability-controls.tsx` — "I took one", "It's gone", plus creator-only bump and close, wired into post detail.

**Verification**
- ✅ All 15 tests pass, including five new ones running as **real signed-in users** rather than the secret key — the guard exempts admin calls, so any other approach would have proved nothing. These are also the suite's first genuine RLS coverage.
- `npm run typecheck`, `npm run lint`, `npm run build` pass.
- ⚠️ The buttons themselves have not been clicked in a browser.

**The hole this closed**
RLS on `posts` grants authenticated students write access to the crowd-sourced columns, which reads correctly as "anyone may report food gone." Taken literally it meant **one API call could close any post**, bypassing the two-distinct-user threshold completely — and a direct write to `servings_remaining` left no per-user record, so §6.1's "logged per-user so abuse can be traced" was quietly untrue. Both are now impossible: those columns change only via attributable events.

This is the second instance of the same pattern (the first was `bump`, found in 5a). **A table whose rows cause side effects elsewhere needs authorization on the effects, not just row ownership.** Step 8's notifications have exactly this shape and should be reviewed with it in mind.

**Note**
- The migration file briefly contained stray characters (`availability_eventsok i`) typed into the editor after it was run. The `creator_close` test passing confirms the original run applied cleanly. Fixed in place.

---

## Step 6 — Map

### 6a — Map of active posts (done, pending browser check)

**What was built**
- `lib/map/config.ts` — style URL, campus centre, zoom levels. Provider/style swap is a one-line change here.
- `app/map/map-view.tsx` — MapLibre map with a marker per active post, navigation + geolocate controls, and a mini-card on tap linking to detail (PRD §5.5).
- `app/map/page.tsx` — uses the **same `feed_posts` RPC** as the feed, so "active" means exactly what it means there, including lazy MAX_AGE expiry.
- Map link added to the nav.
- `maplibre-gl` added as a dependency (approved).

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` pass.
- ✅ Verified in a browser after three separate bugs, all of which produced an identical blank page while typecheck, lint and build stayed green.

**Three silent failures behind one blank map** (worth remembering — none produced an error anywhere in the toolchain):
1. `h-[calc(100dvh-3.5rem)]` emits `height: calc(100dvh-3.5rem)`, which is **invalid CSS** — `calc()` requires whitespace around the minus. The declaration is dropped and height falls back to `auto`, i.e. zero. Tailwind arbitrary values encode those spaces as underscores: `h-[calc(100dvh_-_3.5rem)]`.
2. The inner container used `absolute inset-0`. MapLibre adds `.maplibregl-map` to that element and its stylesheet — loaded after Tailwind — sets `position: relative`, which wins the cascade. `inset-0` then does nothing and the container collapses. Size map containers with explicit `h-full w-full`.
3. **The actual cause:** maplibre-gl v6 emits its web worker as a standalone `.mjs` module script, and Next's dev server answered that URL with its HTML 404 page. Strict MIME checking rejected it, so the worker never started. Vector tiles are parsed *in the worker*, so the map requested **zero** tiles — while still rendering the style's background colour, the controls, and the marker, and firing no error event. Pinned to `maplibre-gl@^5`, which inlines the worker as a blob.

Diagnostic that finally worked: colouring the containers to see which one had size, after three wrong guesses. The lesson is that a blank canvas library needs the *container* proven before anything else is suspected.

**Decisions / deviations**
- **Tile provider: OpenFreeMap, Liberty style** (PRD §11 resolved). No API key, no signup, no usage limits — so nothing secret ships to the client, and a future MapLibre Native client reads the same style URL. Key-based providers (MapTiler, Stadia) gate free tiers by HTTP referrer, which native apps don't send, forcing either a proxy or an exposed key.
- Markers are DOM elements rather than a GeoJSON symbol layer: at tens of posts performance is irrelevant, and DOM markers take the app's own Tailwind tokens. Each pin shows its servings count, which is more useful at a glance than a generic icon — and avoids injecting SVG markup via `innerHTML`.
- 3D (extruded buildings, pitch) deliberately not used: it makes distance harder to judge, competes with the pins, and costs performance on the mid-range phones this is for.
- maplibre-gl v6 is ESM with **named exports only**; there is no default export. Typecheck caught this.

### 6b — Location picker on the create form (done, pending browser check)

**What was built**
- `components/location-picker.tsx` — MapLibre picker with a draggable marker, tap-to-place, and a "use my location" shortcut. Wired into `app/post/new/post-form.tsx`, replacing the geolocation-only capture.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- ⚠️ Not opened in a browser. Worth re-checking the coordinate decode after posting, since latitude/longitude order is silent when wrong (see step 4).

**Why this mattered**
This closes the gap flagged in step 4: geolocation was the only way to set a location, so denying the browser prompt made posting impossible. Geolocation stays the fast path; the pin is the fallback PRD §6.4 always specified.

**Decisions / deviations**
- Two lint errors were fixed rather than suppressed: a ref updated during render now updates in an effect, and an import left unused after the refactor was removed.

---

## Step 8 — Notifications

### 8a — Server-side fan-out (done)

**What was built**
- `supabase/migrations/0008_notifications.sql`:
  - `post_matches_dietary_filter(post_tags, filter)` — defines the previously-unspecified `dietary_filter` jsonb shape as `{"require": [...], "exclude": [...]}`. A post matches when it carries every required tag and none of the excluded ones; `{}` matches everything.
  - `notify_on_new_post` — AFTER INSERT on `posts`, inserting one notification per user whose stored preferences match on location (radius **or** watched building) **and** dietary filter, never to the poster.
  - `notify_on_new_comment` — notifies the post's creator only, skipping their own comments and respecting `notify_on_comment`.
  - `notifications` added to the `supabase_realtime` publication.
- `test/helpers.mjs` — shared fixtures extracted from the lifecycle suite.
- `test/notifications.test.mjs` — 10 tests covering radius hit/miss, self-notification, unconfigured silence, both dietary filter directions, building match, and all three comment cases.

**Verification**
- ✅ All 25 tests pass, three runs in a row.

**Authorization**
Recipients are computed inside a `SECURITY DEFINER` trigger purely from each recipient's own stored preferences; nothing the poster or commenter supplies influences who is notified, and `notifications` still has no user INSERT policy, so these triggers are its only writer. This is the third table whose rows affect other users — after `bump` and `posts.status` — and the first designed with that pattern in mind rather than patched afterwards.

**Decisions / deviations**
- A user with neither a radius nor watched buildings receives **no** nearby-post notifications. Silence until you opt in is the right default; the settings UI must say so, or preferences will look broken.
- Comment notifications default to on when a user has no preferences row at all — replies to your own post are the one alert worth having unasked.

**Flaky test found and fixed**
The first run failed two assertions, the second passed. Cause: `node --test` runs test files in **parallel processes** against one shared database, and the lifecycle suite creates posts at Penn's coordinates — which matched radius preferences registered by the notification suite, leaking notifications across files. Fixed by anchoring the notification suite's geography far from campus and adding `--test-concurrency=1`. Worth remembering: integration suites sharing a real database are only isolated if their *fixtures* cannot see each other.

### 8b — Settings UI + notification bell (done, pending browser check)

**What was built**
- `app/actions/notifications.ts` — `saveNotificationSettings` (upserts the caller's own row; `user_id` comes from the session, never the form) and `markNotificationsRead`.
- `app/settings/notifications/` — page, client wrapper, and form: radius, map-picked centre (reusing `LocationPicker`), watched buildings, require/exclude tag pickers, and the comment toggle.
- `components/notification-bell.tsx` — nav bell with an unread badge, realtime INSERT subscription filtered to the user, and a dropdown list linking to each post.
- `lib/notifications/state.ts`, `lib/geo/ewkb.ts`.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (25) all pass.
- ⚠️ Not exercised in a browser: saving preferences, the realtime badge, and mark-read on open.

**Decisions / deviations**
- **EWKB decoded in TypeScript** rather than adding an RPC. PostgREST returns geography as hex and offers no way to ask for plain coordinates; `parseEwkbPoint` reads the two floats directly, saving a migration round-trip for a two-number lookup.
- **Mark-all-read on opening the dropdown**, rather than per-item read state. The badge answers "anything new since I looked", and per-item tracking is bookkeeping this doesn't earn yet.
- The "where to watch" card states plainly that configuring neither a radius nor a building means no new-post notifications — otherwise 8a's deliberate silence reads as a bug.
- `next/dynamic` with `ssr: false` is rejected inside a Server Component, so the settings form needs a client wrapper exactly like the map did. **Typecheck and lint both passed this; only `npm run build` caught it.**

---

## Step 9 — Polish & moderation

### 9a — Anti-abuse + admin moderation (done)

**What was built**
- `supabase/migrations/0009_moderation.sql`:
  - `rate_limit_gone_reports` — 12 gone-reports per user per hour. The unique index from 0002 already stopped double-reporting one post; this stops one person walking the feed and closing everything. With a threshold of 2, two griefers could otherwise clear the board.
  - `is_admin()` plus `posts_delete_admin` / `comments_delete_admin` RLS policies.
- `app/actions/moderation.ts`, `components/admin-delete-post.tsx` — delete control on post detail, shown only to admins.

**Verification**
- ✅ All 30 tests pass, including five new ones: admin can delete others' posts and comments, an ordinary student cannot, authors keep their own delete, and the rate limit accepts exactly 12 then rejects.
- Confirmed no test fixtures left behind.

**Decisions / deviations**
- **Admin deletes moved from the secret-key client to RLS policies.** 0003 had assumed moderation would bypass RLS via the service key. A policy is better on three counts: the rule sits with every other access rule rather than in application code, admins act as themselves so deletes are attributable, and no secret key needs to reach a delete path. `is_admin()` reads `profiles.role`, which `prevent_role_change` (0002) already stops anyone granting themselves.
- The moderation server action has no privileged path — a non-admin calling it matches zero rows under RLS. The button's visibility is cosmetic, as with every other check in this codebase.
- Rate limit is deliberately generous. PRD §6.1 says don't over-build moderation; the aim is making mass griefing inconvenient, not policing a student who clears out stale posts after an event.

### 9b — Mobile pass + photo compression (done, pending browser check)

**What was built**
- Nav: the wordmark hides below `sm`. With five items (brand, Map, Post food, bell, avatar) it no longer fits a phone, and the actions matter more than the branding.
- Removed the feed's mobile-only "Post food" button — the nav now always shows one, so phones had two.
- `lib/posts/compress-photo.ts` — downscales to a 1600px long edge and re-encodes as JPEG at 0.8 before upload. Falls back to the original file on any failure.

**Verification**
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (30) all pass.
- ⚠️ Not yet checked on a real phone, and the HEIC path specifically needs an iPhone photo to confirm.

**Why compression**
Two problems, one fix, no dependency. iPhones shoot HEIC, which most browsers can't render, so the create-form preview was blank for exactly the users most likely to post — canvas re-encoding fixes that, since iOS Safari decodes HEIC natively. And a 3-5 MB phone photo costs several seconds of the ~15s posting budget (PRD §1) on campus wifi; 1600px/0.8 lands around 200-400 KB, ample for a thumbnail and a detail view. Compression never blocks a post: any failure uploads the original.

**Note**
`xs:` is not a default Tailwind breakpoint. An `xs:inline` class written by mistake generates nothing and fails silently — the same class of invisible error as the `calc()` whitespace bug in step 6.
