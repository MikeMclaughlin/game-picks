# Game Picks

Season-long NFL pick-em. **Not** a survivor / suicide pool.

Each game can take up to three independent wagers — outright winner, against the spread, and over/under. Stay in the pool all season. One point per correct settled wager. Ties and pushes are zero. Missed games are zero, not elimination.

## Stack

- Node.js `http` server only (no Express, no Next.js)
- Neon Postgres via `DATABASE_URL` and `@neondatabase/serverless` (HTTP)
- Google sign-in (OAuth authorization code + PKCE) and a signed `gp_session` cookie
- Vanilla `public/index.html`, `public/styles.css`, `public/app.js`
- Schedule, lines, history, and finals grading from [nfldata.org](https://www.nfldata.org/) / nflverse (`spread_line`, `total_line`, scores), with GitHub mirrors and `data/schedule-2026.json` as fallback
- Live / in-progress scores on Home cards from ESPN’s public scoreboard JSON (`site.web.api.espn.com`). Display only — not used to grade wagers

## Required env

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes, to persist users / wagers / standings | Neon Postgres connection string |
| `GOOGLE_CLIENT_ID` | Yes, for sign-in | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Yes, for sign-in | Google OAuth client secret |
| `SESSION_SECRET` | Yes, for sign-in | HMAC key for the session cookie |
| `PUBLIC_BASE_URL` | Optional | Site origin, no trailing slash. Defaults to `https://game-picks.vercel.app` |
| `ADMIN_KEY` | Optional | When set, `/api/import`, `/api/grade-all`, `/api/cron/scores`, and `/api/cron/live-scores` require header `x-admin-key` (or `?key=`). `Authorization: Bearer CRON_SECRET` is also accepted |
| `CRON_SECRET` | Optional | Vercel cron Bearer token; allowed when `ADMIN_KEY` is set |
| `PORT` | Optional | Local listen port (default `3000`) |
| `POOL_SLUG` | Optional | Default pool (default `default`) |

Do not commit secrets. Copy `.env.example` to `.env` locally.

### Set `DATABASE_URL`

1. Create a Neon project at [neon.tech](https://neon.tech) (free tier is enough).
2. Copy the connection string (pooled or standard URI is fine; the serverless HTTP driver accepts it).
3. Locally: `export DATABASE_URL='postgresql://…'` or put it in `.env` and load it before `npm start`.
4. On Vercel: Project → Settings → Environment Variables → add `DATABASE_URL` (Production + Preview). Root Directory should be the app folder (repo root).

Without `DATABASE_URL`, `npm start` still boots. `/api/health` and `/api/bootstrap` still return JSON from the bundled 2016–2026 seed / 2026 schedule. Sign-in and saved picks require the database.

Without the Google env vars, the app still boots. `/api/health` returns `auth: "missing"`. The header shows **Auth not configured** instead of crashing. See **[AUTH.md](AUTH.md)**.

## Run locally

```bash
npm install
npm test
npm start
```

Then:

- `GET http://localhost:3000/api/health`
- `GET http://localhost:3000/api/bootstrap`

First request with `DATABASE_URL` set applies `sql/schema.sql` and seeds **2016 through the current season**. Import current scores, then grade:

```bash
npm run migrate
npm run import -- --from-2016
# or explicit:
npm run import -- --seasons=2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026
# optional deeper backtest:
npm run import -- --from-2010
npm run grade-all
```

CLI `grade-all` and `GET`/`POST` `/api/grade-all` share the same grader. Import (including `/api/import` and `/api/cron/scores`) runs `gradeAll` automatically after scores land. Vercel Hobby allows one cron per day, so `/api/cron/scores` runs daily at 12:20 UTC (08:20 ET) to refresh the current season and grade. If `ADMIN_KEY` is set, cron may authenticate with `Authorization: Bearer $CRON_SECRET` or `x-admin-key`.

Home (Current Week) cards show a live score row under the team names while a game is in progress, and after kickoff when ESPN has a final. Away and home scores sit on the sides; quarter + clock (or `Final`) is centered. The Home page polls `GET /api/live-scores` every 5 minutes **only while any current-week game is in progress**. The server never calls ESPN during idle hours/weeks (`espn live: skip idle`). Set `ESPN_LIVE=0` to disable the ESPN client. Manual refresh: `GET /api/cron/live-scores` (same admin gate as the nflverse cron).

The week picker loads any regular-season week in the current season via `GET /api/week?season=&week=`, including **upcoming weeks for advance picks**. Locks are per-game at kickoff (not “current week only”). If a future week is missing from the DB, Home shows an empty-week notice — run `npm run import` (or the scores cron) so that week’s schedule/lines exist, then pick normally on unlocked games.

AI picks shown on Current Week cards are upserted into `ai_picks` (keyed by `game_id` / season / week). Query later with `GET /api/ai-picks?season=2026&week=2`.

OUTRIGHT and ATS are mutually exclusive on the same game (O/U may coexist with either). Saving one market clears the other for that user/game. If both rows already exist from before this rule, the next save of either market deletes the partner.

## Product rules (server is source of truth)

- Unique username handle per pool (`username_norm` = NFKC + trim + lower). Google accounts link by email onto the existing user id, including rows that still have `clerk_user_id`
- One wager row per `(user, game, market)` where market is `outright | ats | ou`
- OUTRIGHT and ATS cannot both be stored for the same user/game; saving one deletes the other. O/U is independent
- Validate against the current line; reject after kickoff
- Grade from stored scores + `spread_line` / `total_line` (nflverse: **positive `spread_line` means home favored**)
  - Outright: pick wins if that team’s score is higher; tie = 0
  - ATS: home covers if `(home − away) > spread_line`; away covers if less; equal = push = 0
  - O/U: over if `home + away > total_line`; under if less; equal = push = 0
- Standings = season points, then weekly points
- Upserts never wipe existing scores/lines (`COALESCE`)

## Deploy (Vercel)

`vercel.json` routes all traffic to `server.js` (`@vercel/node`) and includes `public/**`, `src/**`, and `data/**`. Do not switch to `/api/[...path]` rewrites.

Set `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and `PUBLIC_BASE_URL` on the host (see [AUTH.md](AUTH.md)), then deploy. The same server runs on Vercel or Render.
