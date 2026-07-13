# Reward System App

Gamified family/team points tracker. Static SvelteKit SPA on GitHub Pages + free-tier Supabase (Auth, Postgres, Edge Functions) + Threlte 3D vault.

## Stack

- SvelteKit 2 + Svelte 5 runes + `@sveltejs/adapter-static` (SPA / `404.html` fallback)
- Tailwind CSS 4
- Supabase (Email Auth, Postgres, Edge Function → Gemini 2.5 Flash)
- Threlte (`@threlte/core` + `@threlte/extras`)

## Quick start

1. Copy `.env.example` → `.env` and set `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`.
2. In Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql), then [`supabase/migration_households.sql`](./supabase/migration_households.sql).
3. Deploy the AI function:

```bash
supabase functions deploy parse-points-log
supabase secrets set GEMINI_API_KEY=your-gemini-key
```

4. Install and run locally:

```bash
npm install
npm run dev
```

## Sharing with a co-manager

1. Open **Share** in the nav.
2. Copy the invite link or code.
3. The other person signs up / signs in, opens the link (`/join?code=…`), and joins.
4. Both people can manage the same participants, activities, rewards, and ledger.
## GitHub Pages

- Workflow: [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)
- Add repo secrets: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`
- Enable Pages → Source: **GitHub Actions**
- `BASE_PATH` is set to `/<repo-name>` in CI (omit for a user/org root site)

## App routes

| Route | Purpose |
| --- | --- |
| `/login` | Email sign-up / sign-in |
| `/dashboard` | Daily/weekly totals, allocate points, AI log, 3D vault, claim rewards |
| `/participants` | Participant CRUD |
| `/activities` | Activities (`default_points`, `allow_negative`) |
| `/rewards` | Grand rewards CRUD |
| `/share` | Invite co-managers (code + link) |
| `/join` | Accept an invite code |

## Key files requested in the architecture

1. [`svelte.config.js`](./svelte.config.js) + [`src/routes/+layout.ts`](./src/routes/+layout.ts) — static SPA for GitHub Pages  
2. [`supabase/schema.sql`](./supabase/schema.sql) — Postgres schema, negative-points trigger, RLS  
3. [`src/routes/dashboard/+page.svelte`](./src/routes/dashboard/+page.svelte) — runes + AI staging preview  
4. [`src/lib/components/RewardVault.svelte`](./src/lib/components/RewardVault.svelte) — Threlte reward progress vault  
