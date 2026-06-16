# Penn Free Food

A web app where University of Pennsylvania students post leftover/free food on
campus so others can grab it before it's thrown out. The wedge is **trustworthy
live availability** via crowd-sourced status updates. `@upenn.edu`-gated.

See [`docs/prd.md`](docs/prd.md) for the full product spec, [`docs/progress.md`](docs/progress.md)
for build progress, and [`CLAUDE.md`](CLAUDE.md) for conventions.

## Stack

Next.js (App Router) · React · strict TypeScript · Tailwind CSS · shadcn/ui ·
Supabase (Postgres + PostGIS + RLS, Auth, Storage, Realtime) · MapLibre GL JS ·
OpenRouter (vision classifier, server-side) · Vercel.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in your Supabase / OpenRouter
   values. Use the **new** Supabase publishable/secret API keys (not the legacy
   `anon` / `service_role` JWTs).

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Database

SQL migrations live in `supabase/migrations/`. Run them with the Supabase CLI
(`supabase db push`) or paste into the dashboard SQL editor.
