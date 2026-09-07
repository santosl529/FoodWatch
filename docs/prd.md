# PRD: Penn Free Food (working title)

> A spec intended to be handed to an AI coding agent (e.g. Claude Code). It describes **what** to build and **why**, and leaves most implementation **how** to the agent. Keep this document as the source of truth and update it whenever a decision changes mid-build — a stale PRD actively misleads the agent.

---

## 1. Overview

**What it is:** A web app where University of Pennsylvania students post about leftover/free food on campus so other students can come get it before it's thrown away. A post carries a photo, a location, an estimate of servings remaining, and a live "is this still available?" status. Other students browse a feed and a map, ask clarifying questions in comments, and help keep each post's availability accurate.

**Core thesis / differentiator:** The product this replaces is a large, unstructured group chat. The group chat wins on *friction* (everyone's already there, posting is one tap) and loses on *organization* — there's no location, no "is this still available?", no servings count, and posts scroll out of view within minutes. This app's single job is to **keep the group chat's near-zero friction while fixing its staleness and disorganization.** The wedge feature is **trustworthy live availability** (you should be able to believe the app when it says food is still there), achieved through crowd-sourced status updates rather than relying on the original poster. Posting must stay fast: snap a photo, let AI pre-fill the details, confirm, done.

**Design constraint (treat as a hard rule):** If posting takes more than ~15 seconds of user effort, the product has lost to the group chat. Every added field or step must be justified against this budget. The AI classifier exists primarily to *reduce* posting friction (auto-fill from a photo), not to add a feature.

**Scale:** Designed for an initial cohort of tens to low hundreds of Penn students (one campus, one group chat's worth of users). Optimize for clarity, low friction, and iterability over horizontal scalability. This is an MVP whose first goal is to convince one group chat owner to endorse it.

**Phase scope:** This PRD covers the **web MVP** only. A native mobile app (and reliable mobile push) is explicitly deferred until the web MVP is validated — see Out of Scope.

---

## 2. Tech Stack

- **Framework:** Next.js (App Router), React, **strict TypeScript** (`strict: true`, no implicit `any`).
- **Styling/UI:** Tailwind CSS + shadcn/ui components.
- **Hosting:** Vercel.
- **Backend / DB / Auth / Storage / Realtime:** Supabase (Postgres, Supabase Auth, Supabase Storage for photos, Supabase Realtime for live comments and availability updates). Use the **PostGIS** extension for location queries.
- **Map:** **MapLibre GL JS** (free/open) for the MVP. Tiles from a free provider (e.g. a free MapLibre-compatible tile source); the specific tile provider is an open question (see §11).
- **AI:** **OpenRouter** for the vision classifier (photo → food description, dietary/allergen tags, serving estimate). Model is a vision-capable model selected at build time (open question §11). All AI calls happen **server-side only** (route handler or server action); the OpenRouter key never reaches the client.

**Supabase key conventions (non-negotiable):**
- Use the **new publishable and secret API keys**, not the legacy `anon` / `service_role` JWT keys.
- Client-exposed env var: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server-only env var: `SUPABASE_SECRET_KEY` — **never** behind a `NEXT_PUBLIC_` prefix, never shipped to the client.
- Set these up from the start; do not generate legacy keys.

**Design philosophy:** Function over form for the MVP. Use shadcn defaults; don't spend time on bespoke visual design until the concept is validated. Mobile-web layout is the priority (students will use this on phones), but it's a responsive web app, not a native app.

---

## 3. User Roles

Two roles for the MVP:

- **Student (default).** Any user who signs in with a verified `@upenn.edu` email. Can: create posts, comment, update servings/availability on *any* post (crowd-sourced — see §6), report a post as gone, bump their own posts, set notification preferences. This is the only self-service role.
- **Admin.** Assigned directly in the database (no signup flow, no UI to grant it). Can additionally: delete any post or comment (moderation). For the MVP, admin tooling can be minimal — direct DB access is acceptable as a fallback, but a destructive moderation action (delete post/comment) should be available to admins through the normal UI guarded by a server-side role check.

No organizational/poster hierarchy beyond this. A post's creator has a couple of creator-only powers (edit their post's text/photo, bump it), but **servings and availability are editable by any student** by design — that's the differentiator.

---

## 4. Authentication & Onboarding

- **Method:** Supabase Auth **email OTP** (passwordless — emailed code or magic link). Code length is a Supabase project setting (6–10 digits); do not hardcode 6. No passwords.
- **Domain gate:** Only `@upenn.edu` emails may complete signup. **This must be enforced server-side** (Supabase auth hook / database trigger / server-side check at the auth boundary), not merely validated in the client. Client-side validation is a UX nicety; the server check is the actual security boundary. A user typing a non-Penn email must not be able to obtain a session.
- **Onboarding flow:** Enter email → receive OTP → verify → session created. On first login, optionally collect a display name (single field; can default to the email local-part to stay low-friction). Then land on the feed.
- **Session persistence:** Long-lived session ("stay logged in") — the user signs in once and remains authenticated for an extended period (use Supabase's refresh-token session; set a long session lifetime). Re-verification only when the session genuinely expires.
- **Route protection:** All app routes except the sign-in flow require an authenticated session, enforced server-side (middleware / server components checking the session). Unauthenticated users are redirected to sign-in.

---

## 5. Page / Screen Specifications

Behavioral specs only — component/layout choices belong to the agent.

### 5.1 Sign-in (`/signin`) — core
- Email input, "send code" action, OTP entry.
- Client shows a friendly message if the email isn't `@upenn.edu`, but the server is the enforcing layer.
- On success, redirect to the feed.

### 5.2 Feed (`/` or `/feed`) — core
- The default landing surface. A list of active food posts, ranked by the algorithm in §6.
- Each post card shows: photo (thumbnail), short description, dietary/allergen tags, **servings remaining**, location name/building, time since posted, availability status, comment count.
- Primary actions on a card: open detail, quick "it's gone" report, quick servings decrement (low-friction tap), open comments.
- Posts that are closed/expired drop out of the active feed (optionally viewable in a separate "recently gone" section — nice-to-have).
- **Empty state:** clear "no free food right now — be the first to post" with a prominent create button.
- A persistent, prominent **"Post food"** button (the friction budget lives or dies here).

### 5.3 Create post (`/post/new`) — core
- **Photo is required.** Flow: capture/upload photo → photo is sent server-side to the AI classifier → AI returns suggested {description, dietary/allergen tags, estimated servings} → **fields are pre-filled and the user must confirm or edit before posting** (AI output is never posted unconfirmed).
- User sets/confirms **location** (see §6 location capture) and may edit any AI-suggested field.
- Submit creates the post and puts it at the top of the feed.
- If the AI call fails or is slow, fall back to manual entry of the same fields so a classifier problem never blocks posting (the photo is still required; only the auto-fill is skipped).

### 5.4 Post detail (`/post/[id]`) — core
- Full photo, full description, tags, current servings, location (with a small map or "view on map"), status, timestamps, bump state.
- **Comments thread** (realtime): anyone can ask clarifying questions / answer. New comments appear live.
- **Availability controls (any student):** update servings remaining, mark "it's gone" (contributes to crowd-sourced closing — §6).
- **Creator-only controls:** edit description/photo, **bump** the post (re-surface), close the post outright.

### 5.5 Map (`/map`) — core
- MapLibre map showing active posts as pins at their locations, centered on campus.
- Tapping a pin shows a mini-card (photo, description, servings, status) linking to detail.
- Filter to active posts only.

### 5.6 Notification settings (`/settings/notifications`) — core (UI), partial delivery
- User-configurable preferences (all of the following are customizable):
  - **Radius / distance** from a chosen point (or from current location) within which they want to be notified of new posts.
  - **Dietary/allergen filters** — only notify for posts matching/avoiding chosen tags.
  - **Specific buildings/locations** — opt into notifications for chosen buildings.
  - **Comment/reply notifications** on the user's own posts.
- See §6 and §8 for how delivery degrades gracefully (in-app always; web push where supported).

### 5.7 Profile / my posts (`/me`) — nice-to-have
- The user's active and past posts; quick access to bump/close.

---

## 6. Core Logic / Algorithms

This section specifies the mechanics that *are* the product. Spec'd carefully; implementation details (exact thresholds) are tunable and noted as such.

### 6.1 Availability lifecycle (the wedge — get this right)

A post's `status` is one of: `active`, `closed`. The goal is for `active` to be *trustworthy* without depending on the original poster, who often vanishes after posting.

A post closes when **any** of these is true:

```
close_post IF:
  (a) creator explicitly marks it closed, OR
  (b) servings_remaining reaches 0 (via crowd-sourced decrements), OR
  (c) crowd-sourced "it's gone" reports >= GONE_REPORT_THRESHOLD
      from distinct users, OR
  (d) backstop auto-expire: now - last_activity_at > MAX_AGE
```

- `GONE_REPORT_THRESHOLD`: start at **2** distinct users (tunable). One report alone shouldn't close a post (misclick / griefing), two distinct reports is a reasonable signal at this scale.
- `MAX_AGE`: backstop auto-expire, start at **3 hours** since `last_activity_at` (tunable). This catches abandoned posts nobody bothered to close.
- `last_activity_at` updates on: creation, bump, servings change, comment, gone-report.
- **Crowd-sourced edits:** *any* authenticated student may decrement servings or file a gone-report. These actions are logged per-user (see data model) so the threshold counts **distinct** users and so abuse can be traced/rate-limited.
- **Anti-abuse (light, MVP-appropriate):** a single user's repeated gone-reports on the same post count once. Optionally rate-limit gone-reports per user per time window. Don't over-build moderation for the MVP.

### 6.2 Servings counter & bump

- `servings_remaining` is an integer set at creation (AI-estimated, user-confirmed). Any student may decrement it (a one-tap "took some" / "it's running low" affordance) or set a corrected value. Reaching 0 closes the post (6.1b).
- **Bump (creator-only):** re-surfaces the post by updating a `bumped_at` timestamp used in ranking (6.3). Intended for "still here, come get it!" Editing servings upward (creator correcting an estimate) is allowed for the creator; bumping and editing are distinct actions.

### 6.3 Feed ranking

Rank active posts by a blend that weights **recency primarily and distance secondarily**, because "free food posted 3 minutes ago across campus" usually beats "free food 40 minutes ago next door."

```
score = w_recency * recency_factor(max(created_at, bumped_at))
      + w_distance * distance_factor(user_location, post_location)
      + w_servings * servings_factor(servings_remaining)

# recency_factor: decays as the post ages (use freshest of created/bumped)
# distance_factor: higher when closer to the user
# servings_factor: small positive weight — more food left ranks slightly higher
# Start with recency dominant: e.g. w_recency=0.6, w_distance=0.3, w_servings=0.1 (tunable)
```

- If the user's location is unavailable, fall back to recency + servings only.
- Ranking can be computed server-side on fetch. At this scale, a straightforward query + scoring is fine; do not over-engineer.

### 6.4 Location capture

- On post creation, capture the food's location. Preferred: device geolocation (one tap "use my location") with the option to adjust a pin on a MapLibre map and/or pick/enter a building name. Store both coordinates (for the map and distance math) and a human-readable location/building label (for the feed card).
- Use PostGIS for "posts near me" distance calculations and notification-radius checks.

### 6.5 AI classifier (photo → fields)

```
on photo upload (server-side):
  send image to OpenRouter vision model with a structured prompt requesting:
    - short food description (1 line)
    - dietary/allergen tags from the FIXED taxonomy (§9) only
    - estimated servings remaining (integer)
  parse structured (JSON) response
  return suggestions to client to PRE-FILL the create form
  user MUST confirm/edit before the post is created
on failure/timeout:
  return empty suggestions; client falls back to manual entry
```

- The model must be instructed to choose dietary/allergen tags **only** from the enumerated taxonomy in §9 (don't let it invent tags).
- AI output is advisory. Nothing is posted without explicit user confirmation. This is both a quality safeguard (classifiers err) and a safety one (allergen tags must not be trusted blindly — the UI should make clear the tags are AI-suggested and user-confirmed, not guaranteed).
- Cost/latency: one call per post creation. Keep the image reasonably downsized before sending.

### 6.6 Notifications (delivery model)

- **In-app notifications always work** (a notifications list / badge, backed by a table, updated via Realtime).
- **Web push** (via the PWA service worker + Web Push API) is offered where supported. Reliable on Android/desktop Chrome; **degraded on iOS Safari** (requires "Add to Home Screen", delivery unreliable). The settings UI and preference storage are fully built; actual push delivery is best-effort and may be limited on iOS. This limitation is expected for the web MVP and is the main reason a native app is the eventual path (deferred).
- A post triggers a notification to a user when it matches that user's stored preferences (radius/building match AND dietary filter match). Comment notifications go to the post creator.
- Evaluate matches server-side when a post is created (and when a comment is created, for the creator).

---

## 7. Data Model

Conventions: UUID primary keys, `timestamptz` for all times, PostGIS `geography(Point)` for coordinates, `jsonb` where noted. Row-Level Security (RLS) enabled on **every** table (see §8). Types below are guidance, not rigid.

### `profiles`
- `id` uuid PK (= Supabase auth user id)
- `email` text (Penn email, unique)
- `display_name` text
- `role` text default `'student'` — `'student' | 'admin'`
- `created_at` timestamptz

### `posts`
- `id` uuid PK
- `creator_id` uuid FK → profiles.id
- `description` text
- `photo_path` text (Supabase Storage path)
- `servings_remaining` int
- `status` text default `'active'` — `'active' | 'closed'`
- `location` geography(Point) — PostGIS, indexed (GiST) for distance queries
- `location_label` text (e.g. building name)
- `dietary_tags` text[] (values from §9 taxonomy)
- `ai_suggested` jsonb (the raw AI suggestion, for debugging/iteration — optional)
- `created_at` timestamptz
- `bumped_at` timestamptz (nullable)
- `last_activity_at` timestamptz (drives auto-expire 6.1d)
- `closed_at` timestamptz (nullable)
- `close_reason` text (nullable) — `'creator' | 'zero_servings' | 'crowd_reports' | 'expired'`
- Indexes: GiST on `location`; btree on `status`, `last_activity_at`.

### `comments`
- `id` uuid PK
- `post_id` uuid FK → posts.id (indexed)
- `author_id` uuid FK → profiles.id
- `body` text
- `created_at` timestamptz

### `availability_events`
*Logs crowd-sourced actions; enables distinct-user thresholds and abuse tracing.*
- `id` uuid PK
- `post_id` uuid FK → posts.id (indexed)
- `user_id` uuid FK → profiles.id
- `type` text — `'gone_report' | 'servings_update' | 'bump'`
- `servings_value` int (nullable, for servings_update)
- `created_at` timestamptz
- Unique constraint or app logic so one user's `gone_report` per post counts once.

### `notification_preferences`
- `user_id` uuid PK/FK → profiles.id
- `radius_meters` int (nullable)
- `center` geography(Point) (nullable — or use live location)
- `building_labels` text[] (opt-in buildings)
- `dietary_filter` jsonb (include/exclude tag rules)
- `notify_on_comment` bool default true
- `web_push_enabled` bool default false

### `push_subscriptions`
- `id` uuid PK
- `user_id` uuid FK → profiles.id
- `subscription` jsonb (Web Push subscription object)
- `created_at` timestamptz

### `notifications`
*In-app notification feed (always works regardless of push).*
- `id` uuid PK
- `user_id` uuid FK → profiles.id (recipient, indexed)
- `post_id` uuid FK → posts.id (nullable)
- `type` text — `'nearby_post' | 'comment' | 'system'`
- `body` text
- `read` bool default false
- `created_at` timestamptz

**Schema-ready (present, lightly used for now):** `posts.ai_suggested`, `notification_preferences.center` — anticipated needs, no migration required later.

---

## 8. Security / Non-Negotiables

- **`@upenn.edu` enforced server-side** at the auth boundary. Client checks are cosmetic; the server must reject non-Penn sessions.
- **`SUPABASE_SECRET_KEY` and the OpenRouter key never reach the client.** All AI calls and any secret-key DB operations run server-side (route handlers / server actions / edge functions). The publishable key is the only Supabase key in client code.
- **RLS on every table, default-deny.** Specifically:
  - `profiles`: a user can read basic public fields of others (for display names on posts/comments) and update only their own row; `role` is not self-editable.
  - `posts`: any authenticated student can read active posts and insert; updates to `servings_remaining`/status via the defined crowd-sourced actions are allowed for any authenticated student, but creator-only fields (description, photo) are editable only by the creator; only creator or admin can delete.
  - `comments`: any authenticated student can read/insert; author or admin can delete.
  - `availability_events`: insertable by any authenticated student, readable as needed for counting; not editable.
  - `notification_preferences`, `push_subscriptions`, `notifications`: a user can only read/write their **own** rows.
  - `admin` role bypasses for moderation deletes, checked server-side.
- **AI allergen/dietary output is never authoritative.** The UI must present tags as AI-suggested and user-confirmed, never as a guarantee — an allergen miss is a real-world safety issue. User confirmation is mandatory before posting.
- **Crowd-sourced actions are attributable** (logged in `availability_events`) so abuse can be traced and the distinct-user threshold is enforceable.

---

## 9. Domain Data / Taxonomy — Dietary & Allergen Tags

Fixed set for the MVP. The AI classifier must choose **only** from these (stable kebab-case IDs). Do not invent others at runtime; extend the list here in the PRD if needed.

Dietary:
- `vegetarian`
- `vegan`
- `halal`
- `kosher`
- `gluten-free`
- `dairy-free`
- `nut-free`

Contains-allergen (informational warnings):
- `contains-nuts`
- `contains-dairy`
- `contains-gluten`
- `contains-shellfish`
- `contains-eggs`
- `contains-soy`

Food category (optional, for description/filtering — keep short for MVP):
- `meal` (hot/prepared meal)
- `snacks`
- `baked-goods`
- `beverages`
- `produce`
- `other`

---

## 10. Out of Scope (do not build in this PRD's phase)

If a task drifts into any of these, **stop and confirm** before proceeding.

- **Native mobile app (iOS/Android)** and anything requiring an Apple Developer license. Deferred until the web MVP is validated by the group chat owner.
- **Reliable cross-platform push** (especially iOS). Web push is best-effort only; do not invest in workarounds.
- Multi-campus / non-Penn support. Single campus, `@upenn.edu` only.
- Reputation systems, karma, gamification, leaderboards.
- Direct messaging / private chat between users (comments only).
- Complex moderation tooling, automated content moderation, report queues beyond the simple admin delete.
- Payments, donations, or any money movement.
- Scheduled/recurring posts, "food available later" scheduling.
- Advanced search, saved searches, analytics dashboards.
- Internationalization / multi-language.
- Building a custom design system — use shadcn defaults.

---

## 11. Open Questions (decide during the build)

- **MapLibre tile provider** for the MVP (which free tile source / style; whether an API key is needed). Pick the simplest free option that works on Vercel.
- **OpenRouter vision model selection** (which specific vision-capable model balances cost, latency, and accuracy for food photos). Decide empirically with a few test images.
- Exact tuning of `GONE_REPORT_THRESHOLD`, `MAX_AGE`, and ranking weights (`w_recency`, `w_distance`, `w_servings`) — start with the stated defaults, adjust after real use.
- Whether the feed shows a "recently gone" section or simply hides closed posts (nice-to-have).
- Display-name policy (require a name vs. default to email local-part) — lean toward optional/low-friction.
- Visual design specifics and final copy.

---

## 12. Build Order (each step shippable and testable before the next)

1. **Foundation:** Next.js + strict TS + Tailwind + shadcn scaffold on Vercel. Supabase project with new publishable/secret keys wired via the correct env vars. PostGIS enabled.
2. **Schema & RLS:** migrations for all tables in §7, RLS policies per §8, seed a couple of test profiles (including one admin set directly in the DB).
3. **Auth & onboarding:** email OTP with **server-side `@upenn.edu` enforcement**, long-lived sessions, route protection, sign-in page.
4. **Post creation (manual fallback first):** create-post flow with required photo upload to Storage, **manual** entry of description/servings/tags/location (MapLibre location pick + geolocation). No AI yet.
5. **Feed + post detail + comments:** ranked active feed (§6.3), post detail with realtime comments, servings decrement and gone-report actions writing to `availability_events`, availability lifecycle (§6.1) including backstop expire and crowd-close. Creator bump/edit/close.
6. **Map:** MapLibre map of active posts with pins and mini-cards (§5.5).
7. **AI classifier (secondary, layered on step 4):** server-side OpenRouter call on photo upload that pre-fills the create form; user confirms/edits; graceful fallback to manual on failure (§6.5).
8. **Notifications:** preferences UI (§5.6), in-app notifications table + Realtime badge/list, server-side match-on-create logic, then best-effort web push (service worker + subscriptions) — knowing iOS is degraded.
9. **Polish & moderation:** admin delete actions, empty states, mobile-web layout pass, basic anti-abuse (rate-limit gone-reports).

> Resist building schema or features for future (native/multi-campus/reputation) phases beyond what's specified here.

---

## Keeping this PRD current

Treat this document as the source of truth. When a decision changes during the build, **update the relevant section before the next coding task touches that area** — otherwise the coding agent will reinforce the outdated design. Consider keeping a short companion "decisions log" recording the *why* behind non-obvious choices (e.g. why the gone-report threshold is 2, why recency outweighs distance) so they aren't re-litigated later.