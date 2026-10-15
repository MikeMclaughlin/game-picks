'use strict';

const crypto = require('crypto');
const { assertUsername } = require('./username');
const { signSession, parseCookies } = require('./http-util');

const DEFAULT_PUBLIC_BASE_URL = 'https://game-picks.vercel.app';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const OAUTH_COOKIE = 'gp_oauth';
const OAUTH_MAX_AGE = 10 * 60;

let certCache = { keys: [], exp: 0 };

function googleClientId(env = process.env) {
  return String(env.GOOGLE_CLIENT_ID || '').trim();
}

function googleClientSecret(env = process.env) {
  return String(env.GOOGLE_CLIENT_SECRET || '').trim();
}

function sessionSecret(env = process.env) {
  return String(env.SESSION_SECRET || '').trim();
}

function publicBaseUrl(env = process.env) {
  const raw = String(env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).trim().replace(/\/+$/, '');
  return raw || DEFAULT_PUBLIC_BASE_URL;
}

function googleRedirectUri(env = process.env) {
  return `${publicBaseUrl(env)}/api/auth/google/callback`;
}

function isGoogleConfigured(env = process.env) {
  return Boolean(googleClientId(env) && googleClientSecret(env) && sessionSecret(env));
}

function publicAuthConfig(env = process.env) {
  return {
    configured: isGoogleConfigured(env),
    provider: 'google'
  };
}

function authNotConfiguredPayload() {
  return {
    ok: false,
    auth: 'missing',
    error: 'Auth not configured',
    hint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and SESSION_SECRET on your hosting environment. PUBLIC_BASE_URL is the site origin with no trailing slash.'
  };
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function codeChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

function createPkce() {
  const verifier = randomToken(32);
  const state = randomToken(24);
  return {
    verifier,
    state,
    challenge: codeChallenge(verifier),
    exp: Date.now() + OAUTH_MAX_AGE * 1000
  };
}

function sanitizeHandle(raw) {
  if (raw == null) return '';
  return String(raw)
    .normalize('NFKC')
    .trim()
    .replace(/[^\p{L}\p{N}_.\- ]+/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

function displayFromGoogle(profile) {
  const sub = profile && profile.sub ? String(profile.sub) : 'unknown';
  const email = profile && profile.email ? String(profile.email) : '';
  const candidates = [
    profile && profile.name,
    email ? email.split('@')[0] : '',
    `user-${sub.slice(-8)}`
  ];
  for (const raw of candidates) {
    const cleaned = sanitizeHandle(raw);
    if (!cleaned) continue;
    try {
      return assertUsername(cleaned);
    } catch {
      /* try the next candidate */
    }
  }
  return assertUsername('player');
}

function googleAuthorizeUrl(pkce, env = process.env) {
  const params = new URLSearchParams({
    client_id: googleClientId(env),
    redirect_uri: googleRedirectUri(env),
    response_type: 'code',
    scope: 'openid email profile',
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'true'
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

function readOauthCookie(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[OAUTH_COOKIE];
  if (!raw) return null;
  const [body, sig] = String(raw).split('.');
  if (!body || !sig) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.state || !payload.verifier) return null;
    if (payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function statesMatch(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function fetchGoogleCerts() {
  const now = Date.now();
  if (certCache.keys.length && certCache.exp > now) return certCache.keys;
  const res = await fetch(GOOGLE_CERTS_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Google certificate fetch failed');
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  certCache = { keys, exp: now + 60 * 60 * 1000 };
  return keys;
}

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function verifyGoogleIdToken(idToken, env = process.env) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Google ID token is malformed');
  const [headerPart, payloadPart, sigPart] = parts;
  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  if (!header || header.alg !== 'RS256' || !header.kid) throw new Error('Google ID token algorithm is not RS256');
  const now = Math.floor(Date.now() / 1000);
  if (!payload || !payload.exp || Number(payload.exp) < now - 30) throw new Error('Google ID token is expired');
  const iss = payload.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new Error('Google ID token issuer is not Google');
  }
  const clientId = googleClientId(env);
  const aud = payload.aud;
  const audOk = aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
  if (!audOk) throw new Error('Google ID token audience does not match this app');
  if (!payload.sub) throw new Error('Google ID token has no subject');
  if (payload.email && payload.email_verified === false) throw new Error('Google email is not verified');
  const keys = await fetchGoogleCerts();
  const jwk = keys.find((key) => key && key.kid === header.kid);
  if (!jwk) throw new Error('Google ID token key was not found');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    key,
    Buffer.from(sigPart, 'base64url')
  );
  if (!valid) throw new Error('Google ID token signature is invalid');
  return payload;
}

async function exchangeGoogleCode(code, verifier, env = process.env) {
  const body = new URLSearchParams({
    code: String(code || ''),
    client_id: googleClientId(env),
    client_secret: googleClientSecret(env),
    redirect_uri: googleRedirectUri(env),
    grant_type: 'authorization_code',
    code_verifier: String(verifier || '')
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.id_token) {
    throw new Error('Google token exchange failed');
  }
  return verifyGoogleIdToken(payload.id_token, env);
}

function mapUser(row, pool) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    username_norm: row.username_norm,
    pool_id: row.pool_id,
    email: row.email || null,
    google_sub: row.google_sub || null,
    auth_status: row.auth_status || null,
    pool_slug: row.pool_slug || (pool && pool.slug) || null
  };
}

async function upsertGoogleUser(sql, pool, profile) {
  const sub = profile && profile.sub ? String(profile.sub) : '';
  const email = profile && profile.email ? String(profile.email).trim().toLowerCase() : '';
  if (!sql || !pool || !sub) return null;

  const bySub = await sql`
    SELECT u.id, u.username, u.username_norm, u.pool_id,
           u.email, u.google_sub, u.auth_status, p.slug AS pool_slug
    FROM users u JOIN pools p ON p.id = u.pool_id
    WHERE u.google_sub = ${sub} AND u.pool_id = ${pool.id}
  `;
  if (bySub[0]) {
    if (email && !bySub[0].email) {
      await sql`
        UPDATE users SET email = ${email}, auth_status = 'linked'
        WHERE id = ${bySub[0].id} AND email IS NULL
      `;
      bySub[0].email = email;
      bySub[0].auth_status = 'linked';
    }
    return mapUser(bySub[0], pool);
  }

  if (email) {
    const byEmail = await sql`
      SELECT u.id, u.username, u.username_norm, u.pool_id,
             u.email, u.google_sub, u.auth_status, p.slug AS pool_slug
      FROM users u JOIN pools p ON p.id = u.pool_id
      WHERE u.pool_id = ${pool.id} AND lower(u.email) = ${email}
      ORDER BY u.created_at ASC
    `;
    const open = byEmail.filter((row) => !row.google_sub || row.google_sub === sub);
    if (open.length === 1) {
      const linked = await sql`
        UPDATE users
        SET google_sub = ${sub}, email = ${email}, auth_status = 'linked'
        WHERE id = ${open[0].id} AND (google_sub IS NULL OR google_sub = ${sub})
        RETURNING id, username, username_norm, pool_id, email, google_sub, auth_status
      `;
      if (linked[0]) return mapUser({ ...linked[0], pool_slug: open[0].pool_slug }, pool);
    }
    if (byEmail.length) return null;
  }

  const base = displayFromGoogle(profile);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const display = `${base.display.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
    const { display: safeDisplay, norm } = assertUsername(display);
    try {
      const inserted = await sql`
        INSERT INTO users (pool_id, username, username_norm, email, google_sub, auth_status)
        VALUES (${pool.id}, ${safeDisplay}, ${norm}, ${email || null}, ${sub}, 'linked')
        RETURNING id, username, username_norm, pool_id, email, google_sub, auth_status
      `;
      return mapUser(inserted[0], pool);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (!/unique|duplicate/i.test(msg)) throw err;
    }
  }
  const err = new Error('Could not allocate a unique username');
  err.statusCode = 409;
  throw err;
}

function oauthCookieValue(pkce) {
  return signSession({
    state: pkce.state,
    verifier: pkce.verifier,
    exp: pkce.exp
  });
}

module.exports = {
  DEFAULT_PUBLIC_BASE_URL,
  OAUTH_COOKIE,
  OAUTH_MAX_AGE,
  googleClientId,
  googleClientSecret,
  sessionSecret,
  publicBaseUrl,
  googleRedirectUri,
  isGoogleConfigured,
  publicAuthConfig,
  authNotConfiguredPayload,
  randomToken,
  codeChallenge,
  createPkce,
  sanitizeHandle,
  displayFromGoogle,
  googleAuthorizeUrl,
  readOauthCookie,
  statesMatch,
  verifyGoogleIdToken,
  exchangeGoogleCode,
  upsertGoogleUser,
  oauthCookieValue,
  fetchGoogleCerts
};
