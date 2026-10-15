'use strict';

let sql = null;
let initError = null;

function isDatabaseUrl(value) {
  const url = String(value || '').trim();
  if (!url) return false;
  return /^(postgres(ql)?|https):\/\//i.test(url);
}

function databaseUrl() {
  return String(process.env.DATABASE_URL || '').trim();
}

function hasDatabase() {
  return isDatabaseUrl(databaseUrl());
}

function getSql() {
  if (!hasDatabase()) return null;
  if (sql) return sql;
  try {
    const { neon } = require('@neondatabase/serverless');
    sql = neon(databaseUrl(), { fetchOptions: { cache: 'no-store' } });
    return sql;
  } catch (err) {
    initError = err;
    sql = null;
    return null;
  }
}

async function ping(timeoutMs = 3000) {
  if (!hasDatabase()) return { ok: false, status: 'missing', reason: 'DATABASE_URL is not set' };
  let timer;
  try {
    const client = getSql();
    if (!client) {
      return {
        ok: false,
        status: 'error',
        reason: (initError && initError.message) || 'Failed to initialize database client'
      };
    }
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('database ping timeout')), timeoutMs);
    });
    await Promise.race([client`SELECT 1 AS ok`, timeout]);
    return { ok: true, status: 'ok' };
  } catch (err) {
    return { ok: false, status: 'error', reason: err.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dbStatus() {
  if (!hasDatabase()) return 'missing';
  return 'ok';
}

function missingDbPayload(extra = {}) {
  return {
    ok: false,
    db: 'missing',
    error: 'DATABASE_URL is not set. Neon is required for sign-in, picks, grading, and import.',
    hint: 'Set DATABASE_URL on your hosting environment. /api/health and the weekly schedule work without it.',
    ...extra
  };
}

module.exports = {
  hasDatabase,
  getSql,
  ping,
  dbStatus,
  missingDbPayload,
  isDatabaseUrl,
  initError: () => initError
};
