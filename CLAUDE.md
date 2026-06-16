# Penn Free Food

## What this is
Penn Free Food is a web app where University of Pennsylvania students post about leftover/free food on campus so other students can grab it before it's thrown out. It replaces a large, unstructured group chat: the wedge is **trustworthy live availability** — you should be able to believe the app when it says food is still there — achieved via crowd-sourced status updates rather than relying on the original poster. A post carries a required photo, a location (feed + map), servings remaining, and dietary/allergen tags; an AI vision classifier pre-fills those fields from the photo to keep posting under a ~15-second friction budget (the group chat's main advantage). `@upenn.edu`-gated. Designed for tens to low hundreds of users on one campus — optimize for clarity and low friction over scalability. Currently pre-code / web MVP phase; native app deferred until validated.

## Stack
- **Framework:** Next.js (App Router), React, TypeScript (strict)
- **Validation:** Zod — shared between AI tool outputs and DB-facing types
- **Database / auth / storage / realtime:** Supabase (Postgres + PostGIS + RLS, Supabase Auth, Supabase Storage, Supabase Realtime)
- **Styling/UI:** Tailwind CSS + shadcn/ui + Lucide icons (shadcn defaults, no custom design system)
- **Map:** MapLibre GL JS (free/open) — tile provider TBD
- **AI layer:** OpenRouter (vision model) for the food-photo classifier — server-side only
- **Hosting:** Vercel + Supabase cloud

## Commands
```
npm run dev    # start dev server
npm run build  # production build
npm run lint   # ESLint
npx tsc --noEmit  # typecheck
```

## Project structure
```
app/
  actions/       # server actions (auth.ts, posts.ts, …)
  signin/        # email-OTP sign-in page
  feed/          # ranked active-food feed (default landing)
  post/
    new/         # create-post flow (photo required → AI pre-fill → confirm)
    [id]/        # post detail + realtime comments + availability controls
  map/           # MapLibre map of active posts
  settings/
    notifications/  # notification preferences
  me/            # my posts (nice-to-have)
  layout.tsx     # root layout
components/
  nav.tsx        # top nav
  ui/            # shadcn components
lib/
  supabase/
    client.ts    # browser client (publishable key)
    server.ts    # server client (SSR; secret key — server only)
  ai/            # OpenRouter classifier call (server-side)
  utils.ts       # cn() helper
middleware.ts    # session refresh + route protection
supabase/
  migrations/    # SQL migrations (run in Supabase dashboard or CLI)
```

## Conventions
- Match existing code style
- Ask before adding dependencies
- For product spec, see @docs/prd.md. Read the relevant sections when working on related features; don't read the whole thing for small changes.
- If we establish a new convention or hit a non-obvious gotcha, suggest a CLAUDE.md edit — but don't edit it unless I confirm.
- Keep prd.md updated with general build progress and progress.md updated with implementation details

## Supabase keys (non-negotiable)
- Use the **new publishable and secret keys**, not the legacy `anon` / `service_role` JWT keys.
- Client code uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
- `SUPABASE_SECRET_KEY` is server-only — never behind a `NEXT_PUBLIC_` prefix, never shipped to the client.

## Security non-negotiables
- `@upenn.edu` gate is enforced **server-side** at the auth boundary; client checks are cosmetic.
- The Supabase secret key and the OpenRouter key never reach the client — all AI calls and secret-key DB ops run server-side.
- RLS on every table, default-deny.
- AI dietary/allergen tags are **never authoritative** — always presented as AI-suggested + user-confirmed (allergen misses are a real-world safety issue). Never post AI output unconfirmed.

## Secrets
- Never read .env.local or any .env.* file with real values.
- Refer to .env.example for required environment variables.
- If you need an env var's value, ask me.

## Definition of done
- Typecheck passes
- Tests pass
- Lint passes