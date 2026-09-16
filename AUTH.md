# Clerk authentication (Game Picks)

Vanilla Node HTTP + Clerk. Neon remains the source of truth for pool users and wagers. Users are upserted by `clerk_user_id`.

This app does **not** use `@clerk/nextjs` or Express. The server verifies Clerk session JWTs with `@clerk/backend`. The browser loads Clerk JS from Clerk’s CDN (with a jsDelivr fallback) and mounts **Sign in**, **Sign up**, and **UserButton**.

## 1. Set env vars on Vercel

Never commit secret keys. The server reads:

| Name | Where | Purpose |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | Server only | Verify session JWTs / Clerk Backend API |
| `CLERK_PUBLISHABLE_KEY` | Injected into the page (public) | Clerk browser SDK |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same as publishable (optional) | Accepted because Vercel Marketplace often injects this name |
| `CLERK_JWT_KEY` | Server only, optional | PEM JWT public key for networkless verify |

Either publishable name is enough. Both publishable **and** `CLERK_SECRET_KEY` must be set or the UI shows **Auth not configured** and `/api/login` returns JSON `503` instead of crashing. `/api/health` stays up without Clerk (`auth: "missing"`).

### Marketplace (recommended)

1. In the Vercel project: **Integrations → Marketplace → Clerk → Install** (or `vercel integration add clerk` from a linked project).
2. That provisions `CLERK_SECRET_KEY` and usually `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
3. Optionally add `CLERK_PUBLISHABLE_KEY` with the same publishable value so the name matches this repo’s `.env.example`.
4. Apply to **Production** and **Preview**. Redeploy.

### Manual

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. **Configure → API keys**: copy the Publishable Key and Secret Key.
3. Vercel project → **Settings → Environment Variables**:
   - `CLERK_SECRET_KEY` = secret key (`sk_…`)
   - `CLERK_PUBLISHABLE_KEY` = publishable key (`pk_…`)
   - (optional) `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = same publishable key
4. Environments: Production + Preview (+ Development if you use `vercel env pull`).
5. Redeploy. Locally: copy `.env.example` → `.env` and fill the same names.

Also add this app’s URLs in Clerk: **Configure → Domains** (production host and `http://localhost:3000`).

## 2. Enable Google and X/Twitter

OAuth app linking is done in Clerk / the provider consoles, not in this repo. Development instances can use Clerk’s **shared credentials**. Production needs your own OAuth apps.

This app’s UI only offers **Google** and **X/Twitter**. Do not enable Apple for this project; the client provider list is `google` and `x` only.

For both providers:

1. Open [SSO connections](https://dashboard.clerk.com/~/user-authentication/sso-connections).
2. **Add connection → For all users**.
3. Pick the provider, enable **Enable for sign-up and sign-in**, then **Add connection**.

### Google

- **Development:** choose Google and save. Shared credentials are enough.
- **Production:** toggle **Use custom credentials**. Copy Clerk’s **Authorized Redirect URI**.
- [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID** → Web application.
- Authorized JavaScript origins: your site (`https://your-domain.com`) and `http://localhost:3000`.
- Authorized redirect URIs: paste Clerk’s URI.
- Paste Client ID + Client Secret back into Clerk. Put the Google OAuth consent screen **In production** before real users sign in.

### X / Twitter

- **Development:** choose **X/Twitter** and save.
- **Production:** copy Clerk’s **Callback URI / Redirect URL**.
- [X Developer Portal](https://developer.x.com/) → app **User authentication settings**:
  - App permissions: **Read** (minimum)
  - Type of App: **Web App, Automated App or Bot**
  - Callback URI: Clerk’s redirect URL
  - Website URL: your site
- Paste **Client ID** and **Client Secret** (OAuth 2.0) into Clerk.

Official walkthrough: [X/Twitter v2](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/x-twitter).

The header labels the auth area **Social Media sign in** and exposes Google / X buttons (`oauth_google`, `oauth_x` with `oauth_twitter` fallback) plus Clerk’s Sign in / Sign up modals. Apple is not in the UI or the client provider list. Buttons only succeed after the matching SSO connection is enabled.

## 3. How this app uses Clerk

- Browser: session token on `Authorization: Bearer …` for `/api/*`.
- Server: `@clerk/backend` `authenticateRequest` / `verifyToken` (cookie `__session` or Bearer).
- First authenticated request upserts a Neon `users` row keyed by `clerk_user_id`. `username` is a unique standings handle derived from Clerk (username, name, or email local-part).
- Public reads stay public: `/api/week`, `/api/history`, `/api/standings`, `/api/bootstrap`, `/api/health`.
- Mutating picks (`POST /api/picks`) and `/api/me/wagers` require a signed-in Clerk user (legacy `gp_session` cookies still resolve if present).

Local check: `GET /api/health` → `auth` is `"ok"` or `"missing"`. `GET /api/auth/config` never returns the secret key.
