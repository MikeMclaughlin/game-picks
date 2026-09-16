'use strict';

const { assertUsername } = require('./username');

const SOCIAL_PROVIDERS = ['google', 'apple', 'x'];

let cachedClient = null;

function clerkPublishableKey(env = process.env) {
  return String(env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').trim();
}

function clerkSecretKey(env = process.env) {
  return String(env.CLERK_SECRET_KEY || '').trim();
}

function clerkJwtKey(env = process.env) {
  return String(env.CLERK_JWT_KEY || '').trim();
}

function isClerkConfigured(env = process.env) {
  return Boolean(clerkPublishableKey(env) && clerkSecretKey(env));
}

function frontendApiFromKey(key) {
  try {
    const packed = String(key || '').split('_').slice(2).join('_');
    if (!packed) return null;
    const padded = packed.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const domain = decoded.replace(/\$+$/, '').trim();
    return domain || null;
  } catch {
    return null;
  }
}

function publicClerkConfig(env = process.env) {
  const publishableKey = clerkPublishableKey(env);
  const configured = isClerkConfigured(env);
  return {
    configured,
    publishableKey: configured ? publishableKey : null,
    frontendApi: configured ? frontendApiFromKey(publishableKey) : null,
    providers: SOCIAL_PROVIDERS.slice()
  };
}

function authNotConfiguredPayload() {
  return {
    ok: false,
    auth: 'missing',
    error: 'Auth not configured',
    hint: 'Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) on the Vercel project. Enable Google, Apple, and X/Twitter in the Clerk Dashboard (see AUTH.md).'
  };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function extractSessionToken(req) {
  const header = req && req.headers && (req.headers.authorization || req.headers.Authorization);
  if (header && /^Bearer\s+/i.test(String(header))) {
    return String(header).replace(/^Bearer\s+/i, '').trim() || null;
  }
  const cookies = parseCookies(req && req.headers && req.headers.cookie);
  return cookies.__session || cookies.__session_ || null;
}

function requestOrigins(req) {
  const headers = (req && req.headers) || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '')
    .split(',')[0]
    .trim();
  const proto = String(headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http'))
    .split(',')[0]
    .trim();
  const out = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  if (host) {
    out.add(`${proto}://${host}`);
    out.add(`https://${host}`);
    out.add(`http://${host}`);
  }
  if (headers.origin) out.add(String(headers.origin).trim());
  return [...out].filter(Boolean);
}

function toWebRequest(req) {
  const headers = (req && req.headers) || {};
  const host = String(headers['x-forwarded-host'] || headers.host || 'localhost').split(',')[0].trim();
  const proto = String(headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http'))
    .split(',')[0]
    .trim();
  const url = `${proto}://${host}${req.url || '/'}`;
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    webHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  return new Request(url, { method: req.method || 'GET', headers: webHeaders });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || 'timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function getClerkClient() {
  if (!isClerkConfigured()) return null;
  if (cachedClient) return cachedClient;
  const { createClerkClient } = require('@clerk/backend');
  cachedClient = createClerkClient({
    secretKey: clerkSecretKey(),
    publishableKey: clerkPublishableKey(),
    jwtKey: clerkJwtKey() || undefined
  });
  return cachedClient;
}

function resetClerkClient() {
  cachedClient = null;
}

function primaryEmail(clerkUser) {
  if (!clerkUser) return '';
  if (clerkUser.primaryEmailAddress && clerkUser.primaryEmailAddress.emailAddress) {
    return clerkUser.primaryEmailAddress.emailAddress;
  }
  const list = clerkUser.emailAddresses || clerkUser.email_addresses || [];
  const id = clerkUser.primaryEmailAddressId || clerkUser.primary_email_address_id;
  const match = id ? list.find((row) => row && row.id === id) : list[0];
  return (match && (match.emailAddress || match.email_address)) || '';
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

function displayFromClerk(clerkUser) {
  const id = clerkUser && clerkUser.id ? String(clerkUser.id) : 'unknown';
  const email = primaryEmail(clerkUser);
  const full = [clerkUser && clerkUser.firstName, clerkUser && clerkUser.lastName].filter(Boolean).join(' ').trim();
  const candidates = [
    clerkUser && clerkUser.username,
    clerkUser && clerkUser.fullName,
    full,
    email ? email.split('@')[0] : '',
    `user-${id.replace(/^user_/, '').slice(-8)}`
  ];
  for (const raw of candidates) {
    const cleaned = sanitizeHandle(raw);
    if (!cleaned) continue;
    try {
      return assertUsername(cleaned);
    } catch {
      /* try next candidate */
    }
  }
  return assertUsername('player');
}

async function authenticateClerk(req) {
  if (!isClerkConfigured()) {
    return { configured: false, userId: null, reason: 'missing' };
  }
  const secretKey = clerkSecretKey();
  const publishableKey = clerkPublishableKey();
  const jwtKey = clerkJwtKey() || undefined;
  const authorizedParties = requestOrigins(req);
  const token = extractSessionToken(req);

  try {
    const client = getClerkClient();
    if (client && typeof client.authenticateRequest === 'function') {
      try {
        const state = await withTimeout(
          client.authenticateRequest(toWebRequest(req), {
            secretKey,
            publishableKey,
            jwtKey,
            authorizedParties
          }),
          5000,
          'clerk authenticateRequest timeout'
        );
        if (state && state.isAuthenticated) {
          const auth = typeof state.toAuth === 'function' ? state.toAuth() : state;
          const userId = auth && (auth.userId || auth.sub);
          if (userId) {
            return { configured: true, userId, token: state.token || token, reason: 'ok' };
          }
        }
      } catch {
        /* fall through to verifyToken */
      }
    }

    if (!token) return { configured: true, userId: null, reason: 'signed-out' };

    const { verifyToken } = require('@clerk/backend');
    let payload;
    try {
      payload = await withTimeout(
        verifyToken(token, { secretKey, jwtKey, authorizedParties }),
        5000,
        'clerk verifyToken timeout'
      );
    } catch {
      payload = await withTimeout(
        verifyToken(token, { secretKey, jwtKey }),
        5000,
        'clerk verifyToken timeout'
      );
    }
    const userId = payload && (payload.sub || payload.userId);
    if (!userId) return { configured: true, userId: null, reason: 'invalid' };
    return { configured: true, userId, token, payload, reason: 'ok' };
  } catch (err) {
    console.error('clerk auth failed', err && err.message ? err.message : err);
    return { configured: true, userId: null, reason: 'error', error: err && err.message };
  }
}

async function fetchClerkUser(userId) {
  const client = getClerkClient();
  if (!client || !userId) return { id: userId };
  try {
    const user = await withTimeout(client.users.getUser(userId), 5000, 'clerk getUser timeout');
    return user || { id: userId };
  } catch (err) {
    console.error('clerk getUser failed', err && err.message ? err.message : err);
    return { id: userId };
  }
}

function mapPoolUser(row, pool) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    username_norm: row.username_norm,
    pool_id: row.pool_id,
    clerk_user_id: row.clerk_user_id || null,
    pool_slug: row.pool_slug || (pool && pool.slug) || null
  };
}

async function upsertPoolUser(sql, pool, clerkUser) {
  const clerkId = clerkUser && clerkUser.id;
  if (!sql || !pool || !clerkId) return null;

  const existing = await sql`
    SELECT u.id, u.username, u.username_norm, u.pool_id, u.clerk_user_id, p.slug AS pool_slug
    FROM users u JOIN pools p ON p.id = u.pool_id
    WHERE u.clerk_user_id = ${clerkId} AND u.pool_id = ${pool.id}
  `;
  if (existing[0]) return mapPoolUser(existing[0], pool);

  const base = displayFromClerk(clerkUser);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const display = `${base.display.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
    const { display: safeDisplay, norm } = assertUsername(display);
    try {
      const inserted = await sql`
        INSERT INTO users (pool_id, username, username_norm, clerk_user_id)
        VALUES (${pool.id}, ${safeDisplay}, ${norm}, ${clerkId})
        RETURNING id, username, username_norm, pool_id, clerk_user_id
      `;
      return mapPoolUser(inserted[0], pool);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (!/unique|duplicate/i.test(msg)) throw err;
    }
  }
  const err = new Error('Could not allocate a unique username');
  err.statusCode = 409;
  throw err;
}

module.exports = {
  SOCIAL_PROVIDERS,
  clerkPublishableKey,
  clerkSecretKey,
  clerkJwtKey,
  isClerkConfigured,
  frontendApiFromKey,
  publicClerkConfig,
  authNotConfiguredPayload,
  parseCookies,
  extractSessionToken,
  requestOrigins,
  toWebRequest,
  getClerkClient,
  resetClerkClient,
  primaryEmail,
  sanitizeHandle,
  displayFromClerk,
  authenticateClerk,
  fetchClerkUser,
  upsertPoolUser
};
