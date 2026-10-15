# Google sign-in (Game Picks)

The server is plain Node HTTP. Neon (`DATABASE_URL`) stores users and wagers. Google sign-in uses Mike's OAuth client.

Sessions are an HttpOnly `gp_session` cookie signed with `SESSION_SECRET` (`SameSite=Lax`, `Secure` on HTTPS). The OAuth start route is `/api/auth/google`. The callback is `PUBLIC_BASE_URL + /api/auth/google/callback`. PKCE (`S256`) and a signed `state` cookie protect the redirect.

## Env vars

Set these on the host (Vercel, Render, or local). Do not commit them.

| Name | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `SESSION_SECRET` | HMAC key for the session cookie and the OAuth state cookie |
| `PUBLIC_BASE_URL` | Site origin, no trailing slash. Defaults to `https://game-picks.vercel.app` when unset |
| `DATABASE_URL` | Neon Postgres connection string |

Authorized redirect URI on the Google client: `PUBLIC_BASE_URL/api/auth/google/callback` (no trailing slash). Example: `https://game-picks.vercel.app/api/auth/google/callback`.

Authorized JavaScript origin: the site origin, no trailing slash. Example: `https://game-picks.vercel.app`.

Without the Google vars, `/api/health` stays up with `auth: "missing"` and the header shows **Auth not configured**.

## One-time email copy

The one-time script in `scripts/` (see the comment at the top of that file) backs up `users`, `wagers`, `wager_results`, and `wager_history` to `/tmp/game-picks-user-backup-<timestamp>.json` before it writes. It copies emails onto the existing user rows when that script's secret is set, flags users with no email, and does not delete picks. Running it again does not change per-user wager counts. Google sign-in later attaches `google_sub` to the row with that email. Delete the script after the migration is confirmed.
