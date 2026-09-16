# Game Picks

Season-long NFL pick-em. **Not** a survivor / suicide pool.

Each game can take up to three independent wagers — outright winner, against the spread, and over/under. Stay in the pool all season. One point per correct settled wager. Ties and pushes are zero. Missed games are zero, not elimination.

## Stack

- Node.js `http` server only (no Express, no Next.js)
- Neon Postgres via `DATABASE_URL` and `@neondatabase/serverless` (HTTP)
- Clerk social sign-in (Google, X/Twitter) via `@clerk/backend` + Clerk browser CDN
- Vanilla `public/index.html`, `public/styles.css`, `public/app.js`
- Schedule, scores, and lines from [nfldata.org](https://www.nfldata.org/) (`spread_line`, `total_line`, scores), with GitHub nflverse mirrors and `data/schedule-2026.json` as fallback

## Required env

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes, to persist users / wagers / standings | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | Yes, for sign-in | Clerk secret key (`sk_…`) |
| `CLERK_PUBLISHABLE_KEY` | Yes, for sign-in | Clerk publishable key (`pk_…`). `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is also accepted (Marketplace name) |
| `CLERK_JWT_KEY` | Optional | PEM JWT public key for networkless verify |
| `ADMIN_KEY` | Optional | When set, `/api/import` and `/api/grade-all` require header `x-admin-key` (or `?key=`) |
| `PORT` | Optional | Local listen port (default `3000`) |
| `POOL_SLUG` | Optional | Default pool (default `default`) |

Do not commit secrets. Copy `.env.example` to `.env` locally.

### Set `DATABASE_URL`

1. Create a Neon project at [neon.tech](https://neon.tech) (free tier is enough).
2. Copy the connection string (pooled or standard URI is fine; the serverless HTTP driver accepts it).
3. Locally: `export DATABASE_URL='postgresql://…'` or put it in `.env` and load it before `npm start`.
4. On Vercel: Project → Settings → Environment Variables → add `DATABASE_URL` (Production + Preview). Root Directory should be the app folder (repo root).

Without `DATABASE_URL`, `npm start` still boots. `/api/health` and `/api/bootstrap` still return JSON from the bundled 2023–2026 seed / 2026 schedule. Sign-in and saved picks require the database.

Without Clerk keys, the app still boots. `/api/health` returns `auth: "missing"`. The header shows **Auth not configured** instead of crashing. See **[AUTH.md](AUTH.md)** for Vercel env vars and enabling Google and X/Twitter in the Clerk Dashboard.

## Run locally

```bash
npm install
npm test
npm start
```

Then:

- `GET http://localhost:3000/api/health`
- `GET http://localhost:3000/api/bootstrap`

First request with `DATABASE_URL` set applies `sql/schema.sql` and seeds the last three completed seasons plus the current year (2023–2026 in v1). Import is written so history can later extend to 2010:

```bash
npm run migrate
npm run import -- --seasons=2023,2024,2025,2026
# later, backtest:
npm run import -- --from-2010
npm run grade-all
```

CLI `grade-all` and `GET`/`POST` `/api/grade-all` share the same grader.

## Product rules (server is source of truth)

- Unique username handle per pool (`username_norm` = NFKC + trim + lower), keyed to Clerk via `clerk_user_id`
- One wager row per `(user, game, market)` where market is `outright | ats | ou`
- Validate against the current line; reject after kickoff
- Grade from stored scores + `spread_line` / `total_line` (nflverse: **positive `spread_line` means home favored**)
  - Outright: pick wins if that team’s score is higher; tie = 0
  - ATS: home covers if `(home − away) > spread_line`; away covers if less; equal = push = 0
  - O/U: over if `home + away > total_line`; under if less; equal = push = 0
- Standings = season points, then weekly points
- Upserts never wipe existing scores/lines (`COALESCE`)

## Deploy (Vercel)

`vercel.json` routes all traffic to `server.js` (`@vercel/node`) and includes `public/**`, `src/**`, and `data/**`. Do not switch to `/api/[...path]` rewrites.

Set `DATABASE_URL` plus Clerk keys on the Vercel project (`CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), enable Google and X in the Clerk Dashboard (see [AUTH.md](AUTH.md)), then deploy.
