'use strict';

const fs = require('fs');
const path = require('path');
const { hasDatabase, getSql } = require('../src/db');
const { ensureSchema } = require('../src/schema');

const USER_TABLES = ['users', 'wagers', 'wager_results', 'wager_history'];

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}

function clerkEmail(user) {
  const list = (user && (user.email_addresses || user.emailAddresses)) || [];
  const primaryId = user && (user.primary_email_address_id || user.primaryEmailAddressId);
  const match = (primaryId && list.find((row) => row && row.id === primaryId)) || list[0];
  const email = match && (match.email_address || match.emailAddress);
  return email ? String(email).trim().toLowerCase() : '';
}

async function fetchClerkUsers(secret) {
  const users = [];
  let offset = 0;
  const limit = 100;
  while (offset < 10000) {
    const res = await fetch(`https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`, {
      headers: { authorization: `Bearer ${secret}`, accept: 'application/json' }
    });
    if (!res.ok) {
      const err = new Error(`Clerk user list failed (${res.status})`);
      err.statusCode = res.status;
      throw err;
    }
    const page = await res.json();
    const rows = Array.isArray(page) ? page : (page && page.data) || [];
    users.push(...rows);
    if (rows.length < limit) break;
    offset += rows.length;
  }
  return users;
}

async function snapshot(sql) {
  const users = await sql`
    SELECT id, username, clerk_user_id, email, google_sub, auth_status, pool_id, created_at
    FROM users
    ORDER BY created_at ASC
  `;
  const counts = [];
  for (const user of users) {
    const wagers = await sql`SELECT COUNT(*)::int AS n FROM wagers WHERE user_id = ${user.id}`;
    const history = await sql`SELECT COUNT(*)::int AS n FROM wager_history WHERE user_id = ${user.id}`;
    const results = await sql`
      SELECT COUNT(*)::int AS n
      FROM wager_results r
      JOIN wagers w ON w.id = r.wager_id
      WHERE w.user_id = ${user.id}
    `;
    counts.push({
      id: user.id,
      username: user.username,
      clerk_user_id: user.clerk_user_id || null,
      has_email: Boolean(user.email),
      google_sub: Boolean(user.google_sub),
      auth_status: user.auth_status || null,
      wagers: Number(wagers[0].n),
      history: Number(history[0].n),
      results: Number(results[0].n)
    });
  }
  return {
    users: users.length,
    wagers: counts.reduce((sum, row) => sum + row.wagers, 0),
    history: counts.reduce((sum, row) => sum + row.history, 0),
    results: counts.reduce((sum, row) => sum + row.results, 0),
    perUser: counts
  };
}

function countsMatch(before, after) {
  if (before.users !== after.users) return false;
  if (before.wagers !== after.wagers || before.history !== after.history || before.results !== after.results) return false;
  const afterById = new Map(after.perUser.map((row) => [row.id, row]));
  return before.perUser.every((row) => {
    const next = afterById.get(row.id);
    return next && next.wagers === row.wagers && next.history === row.history && next.results === row.results;
  });
}

async function backupTables(sql, file) {
  const tables = {};
  tables.users = await sql`SELECT * FROM users ORDER BY created_at ASC`;
  tables.wagers = await sql`SELECT * FROM wagers ORDER BY created_at ASC`;
  tables.wager_results = await sql`SELECT * FROM wager_results`;
  tables.wager_history = await sql`SELECT * FROM wager_history ORDER BY at ASC`;
  const payload = {
    takenAt: new Date().toISOString(),
    tables: USER_TABLES.reduce((out, name) => {
      out[name] = tables[name];
      return out;
    }, {})
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload));
  return {
    file,
    rows: Object.fromEntries(USER_TABLES.map((name) => [name, tables[name].length]))
  };
}

async function migrateClerkToGoogle(sql, options = {}) {
  await ensureSchema(sql);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = options.backupFile || path.join('/tmp', `game-picks-user-backup-${stamp}.json`);
  const backup = await backupTables(sql, backupFile);
  const before = await snapshot(sql);
  const secret = String(process.env.CLERK_SECRET_KEY || '').trim();
  const clerkById = new Map();
  let clerkFetch = 'skipped';
  if (secret) {
    const remote = await fetchClerkUsers(secret);
    for (const user of remote) {
      if (user && user.id) clerkById.set(String(user.id), clerkEmail(user));
    }
    clerkFetch = 'ok';
  }

  const users = await sql`SELECT id, username, clerk_user_id, email, auth_status, google_sub FROM users`;
  const emailOwners = new Map();
  for (const user of users) {
    const fromClerk = user.clerk_user_id ? clerkById.get(String(user.clerk_user_id)) : '';
    const stored = user.email ? String(user.email).trim().toLowerCase() : '';
    const email = stored || fromClerk;
    if (!email) continue;
    if (!emailOwners.has(email)) emailOwners.set(email, []);
    emailOwners.get(email).push(user.id);
  }

  const flagged = [];
  for (const user of users) {
    const clerkId = user.clerk_user_id ? String(user.clerk_user_id) : '';
    const fromClerk = clerkId && clerkById.has(clerkId) ? clerkById.get(clerkId) : '';
    const stored = user.email ? String(user.email).trim().toLowerCase() : '';
    const email = stored || fromClerk;
    let status = user.auth_status || null;
    if (user.google_sub) {
      status = 'linked';
    } else if (!email) {
      status = clerkId ? 'unmatched_no_email' : 'unmatched_no_identity';
      flagged.push({ id: user.id, username: user.username, clerk_user_id: clerkId || null, reason: status });
    } else if ((emailOwners.get(email) || []).length > 1) {
      status = 'unmatched_duplicate_email';
      flagged.push({ id: user.id, username: user.username, clerk_user_id: clerkId || null, reason: status });
    } else {
      status = 'pending_google';
    }
    if (email && user.email !== email) {
      await sql`UPDATE users SET email = ${email}, auth_status = ${status} WHERE id = ${user.id}`;
    } else if (status !== user.auth_status) {
      await sql`UPDATE users SET auth_status = ${status} WHERE id = ${user.id}`;
    }
  }

  const after = await snapshot(sql);
  const matched = countsMatch(before, after);
  if (!matched) {
    const err = new Error('Per-user row counts changed during migration');
    err.before = before;
    err.after = after;
    throw err;
  }
  await sql`
    INSERT INTO app_meta (key, value)
    VALUES ('clerk_google_migration', ${JSON.stringify({ at: new Date().toISOString(), users: after.users, flagged: flagged.length })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return {
    backup,
    clerkFetch,
    before,
    after,
    matched,
    flagged
  };
}

async function main() {
  loadDotEnv();
  if (!hasDatabase()) {
    console.log(JSON.stringify({ ok: false, reason: 'DATABASE_URL is not set', migrated: false }));
    return;
  }
  const sql = getSql();
  const result = await migrateClerkToGoogle(sql);
  const report = {
    ok: true,
    backup: result.backup.file,
    backupRows: result.backup.rows,
    clerkFetch: result.clerkFetch,
    matched: result.matched,
    before: { users: result.before.users, wagers: result.before.wagers, history: result.before.history, results: result.before.results, perUser: result.before.perUser },
    after: { users: result.after.users, wagers: result.after.wagers, history: result.after.history, results: result.after.results, perUser: result.after.perUser },
    flagged: result.flagged
  };
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { migrateClerkToGoogle, snapshot, countsMatch, clerkEmail };
