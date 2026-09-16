'use strict';

const crypto = require('crypto');
const { hasDatabase, getSql, ping } = require('./db');

function runSql(sql, text, params = []) {
  if (!sql) throw new Error('No database');
  if (typeof sql.query === 'function') return sql.query(text, params);
  return sql(text, params);
}

function cookieSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'game-picks-dev-secret';
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', cookieSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies.gp_session;
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', cookieSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionCookie(token, maxAge = 60 * 60 * 24 * 180) {
  const parts = [
    `gp_session=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie() {
  const parts = ['gp_session=', 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

function requireAdmin(req, url) {
  const key = process.env.ADMIN_KEY;
  if (!key) return true;
  const provided = req.headers['x-admin-key'] || url.searchParams.get('key');
  if (provided !== key) {
    const err = new Error('Admin key required');
    err.statusCode = 401;
    throw err;
  }
  return true;
}

function json(res, status, body, extraHeaders) {
  const data = JSON.stringify(body);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
    ...extraHeaders
  };
  res.writeHead(status, headers);
  res.end(data);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function mapGame(row) {
  if (!row) return null;
  return {
    game_id: row.game_id,
    season: Number(row.season),
    week: Number(row.week),
    game_type: row.game_type,
    kickoff: row.kickoff instanceof Date ? row.kickoff.toISOString() : row.kickoff,
    gameday: row.gameday,
    weekday: row.weekday,
    gametime: row.gametime,
    home_team: row.home_team,
    away_team: row.away_team,
    home_score: row.home_score == null ? null : Number(row.home_score),
    away_score: row.away_score == null ? null : Number(row.away_score),
    spread_line: row.spread_line == null ? null : Number(row.spread_line),
    total_line: row.total_line == null ? null : Number(row.total_line),
    home_rest: row.home_rest == null ? null : Number(row.home_rest),
    away_rest: row.away_rest == null ? null : Number(row.away_rest),
    roof: row.roof,
    surface: row.surface,
    temp: row.temp == null ? null : Number(row.temp),
    wind: row.wind == null ? null : Number(row.wind),
    location: row.location,
    overtime: row.overtime == null ? null : Number(row.overtime)
  };
}

async function getPool(sql, slug) {
  const key = slug || process.env.POOL_SLUG || 'default';
  const rows = await sql`
    INSERT INTO pools (slug, name) VALUES (${key}, 'Season Pick-Em')
    ON CONFLICT (slug) DO UPDATE SET name = pools.name
    RETURNING id, slug, name
  `;
  return rows[0];
}

module.exports = {
  runSql,
  signSession,
  readSession,
  sessionCookie,
  clearCookie,
  requireAdmin,
  json,
  readBody,
  mapGame,
  getPool,
  hasDatabase,
  getSql,
  ping
};
