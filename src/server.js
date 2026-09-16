'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ensureSchema } = require('./schema');
const { hasDatabase, getSql, ping, missingDbPayload } = require('./db');
const {
  json,
  readBody,
  readSession,
  clearCookie,
  requireAdmin,
  mapGame,
  getPool
} = require('./http-util');
const {
  isClerkConfigured,
  publicClerkConfig,
  authNotConfiguredPayload,
  authenticateClerk,
  fetchClerkUser,
  upsertPoolUser
} = require('./clerk-auth');
const { validatePick, gradeAll, isLocked } = require('./grader');
const { importGames, loadSeedGames, loadSchedule2026, defaultSeasons } = require('./nfl-data');
const { enrichGame, currentSeasonWeek } = require('./week-view');
const { parseHistoryFilters, historyPayload } = require('./history');
const { listTeamAbbrs } = require('./teams');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8'
};

let seedPromise = null;

async function withDb() {
  if (!hasDatabase()) return { sql: null, db: false, status: 'missing' };
  try {
    const sql = getSql();
    if (!sql) return { sql: null, db: false, status: 'error', error: 'Failed to initialize database client' };
    await ensureSchema(sql);
    return { sql, db: true, status: 'ok' };
  } catch (err) {
    console.error('database init failed', err);
    return { sql: null, db: false, status: 'error', error: err.message };
  }
}

function dbUnavailable(res, dbState) {
  const extra = dbState && dbState.status === 'error' && dbState.error
    ? { error: `Database unavailable: ${dbState.error}`, db: 'error' }
    : {};
  return json(res, 503, missingDbPayload(extra));
}

async function seedIfNeeded(sql) {
  if (!sql) return { seeded: false };
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const seasons = defaultSeasons();
    let counts = [];
    try {
      counts = await sql`SELECT season, COUNT(*)::int AS n FROM games GROUP BY season`;
    } catch {
      counts = [];
    }
    const bySeason = {};
    for (const row of counts) bySeason[Number(row.season)] = Number(row.n);
    const missing = seasons.filter((s) => !bySeason[s] || bySeason[s] < 200);
    if (!missing.length) {
      try {
        const meta = await sql`SELECT updated_at FROM app_meta WHERE key = 'last_import'`;
        const stale = !meta[0] || Date.now() - new Date(meta[0].updated_at).getTime() > 15 * 60 * 1000;
        if (stale) {
          const current = seasons[seasons.length - 1];
          const refreshed = await importGames(sql, {
            seasons: [current],
            preferBundled: false,
            remoteTimeoutMs: 5000
          });
          return { seeded: false, refreshed: true, bySeason, seasons, ...refreshed };
        }
      } catch (err) {
        return { seeded: false, bySeason, seasons, refreshError: err.message };
      }
      return { seeded: false, bySeason, seasons };
    }
    const result = await importGames(sql, {
      seasons,
      preferBundled: true,
      seedOnly: false,
      remoteTimeoutMs: 6000
    });
    return { seeded: true, missing, bySeason, ...result };
  })();
  try {
    return await seedPromise;
  } catch (err) {
    seedPromise = null;
    throw err;
  }
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  let body = fs.readFileSync(filePath);
  if (ext === '.html') {
    let html = body.toString('utf8');
    const cfg = JSON.stringify(publicClerkConfig());
    if (!html.includes('window.__CLERK_CONFIG__')) {
      html = html.replace('</head>', `<script>window.__CLERK_CONFIG__=${cfg};</script>\n</head>`);
    }
    body = Buffer.from(html, 'utf8');
  }
  const noStore = ext === '.html' || ext === '.js' || ext === '.css';
  res.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    'cache-control': noStore ? 'no-store' : 'public, max-age=3600'
  });
  res.end(body);
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const decoded = decodeURIComponent(rel);
  const full = path.normalize(path.join(PUBLIC, decoded));
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403).end('Forbidden');
    return true;
  }
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    sendFile(res, full);
    return true;
  }
  if (decoded === '/favicon.ico' && fs.existsSync(path.join(PUBLIC, 'favicon.ico'))) {
    sendFile(res, path.join(PUBLIC, 'favicon.ico'));
    return true;
  }
  return false;
}

async function allGames(sql) {
  if (sql) {
    const rows = await sql`SELECT * FROM games ORDER BY kickoff ASC`;
    return rows.map(mapGame);
  }
  const seeded = loadSeedGames();
  return seeded.length ? seeded : loadSchedule2026();
}

async function gamesForWeek(sql, season, week) {
  const games = await allGames(sql);
  return games.filter((g) => Number(g.season) === Number(season) && Number(g.week) === Number(week));
}

async function currentUser(sql, req) {
  if (sql) {
    const clerk = await authenticateClerk(req);
    if (clerk.userId) {
      const pool = await getPool(sql);
      const existing = await sql`
        SELECT u.id, u.username, u.username_norm, u.pool_id, u.clerk_user_id, p.slug AS pool_slug
        FROM users u JOIN pools p ON p.id = u.pool_id
        WHERE u.clerk_user_id = ${clerk.userId} AND u.pool_id = ${pool.id}
      `;
      if (existing[0]) return existing[0];
      const profile = await fetchClerkUser(clerk.userId);
      return upsertPoolUser(sql, pool, profile || { id: clerk.userId });
    }
  }
  const session = readSession(req.headers.cookie);
  if (!session || !session.userId || !sql) return null;
  const rows = await sql`
    SELECT u.id, u.username, u.username_norm, u.pool_id, u.clerk_user_id, p.slug AS pool_slug
    FROM users u JOIN pools p ON p.id = u.pool_id
    WHERE u.id = ${session.userId}
  `;
  return rows[0] || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    pool: user.pool_slug,
    clerk_user_id: user.clerk_user_id || null
  };
}

function authMissing(res) {
  return json(res, 503, authNotConfiguredPayload());
}

function signInRequired(res) {
  return json(res, 401, {
    ok: false,
    error: isClerkConfigured()
      ? 'Sign in with Google, Apple, or X to continue'
      : 'Auth not configured'
  });
}

async function userWagers(sql, userId, gameIds) {
  if (!sql || !userId) return [];
  if (gameIds && gameIds.length) {
    return sql`
      SELECT w.id, w.game_id, w.market, w.selection, w.line_at_pick, w.updated_at,
             wr.result, wr.points
      FROM wagers w
      LEFT JOIN wager_results wr ON wr.wager_id = w.id
      WHERE w.user_id = ${userId} AND w.game_id = ANY(${gameIds})
    `;
  }
  return sql`
    SELECT w.id, w.game_id, w.market, w.selection, w.line_at_pick, w.updated_at,
           wr.result, wr.points
    FROM wagers w
    LEFT JOIN wager_results wr ON wr.wager_id = w.id
    WHERE w.user_id = ${userId}
  `;
}

async function standings(sql, poolId, season, week) {
  if (!sql) return [];
  const rows = await sql`
    SELECT
      u.id,
      u.username,
      COALESCE(SUM(wr.points) FILTER (WHERE g.season = ${season}), 0)::int AS season_points,
      COALESCE(SUM(wr.points) FILTER (WHERE g.season = ${season} AND g.week = ${week}), 0)::int AS weekly_points,
      COUNT(w.id) FILTER (WHERE g.season = ${season})::int AS wagers,
      COUNT(wr.wager_id) FILTER (WHERE g.season = ${season} AND wr.result = 'win')::int AS wins,
      COUNT(wr.wager_id) FILTER (WHERE g.season = ${season} AND wr.result IN ('win','loss','push'))::int AS settled
    FROM users u
    LEFT JOIN wagers w ON w.user_id = u.id
    LEFT JOIN games g ON g.game_id = w.game_id
    LEFT JOIN wager_results wr ON wr.wager_id = w.id
    WHERE u.pool_id = ${poolId}
    GROUP BY u.id, u.username, u.username_norm
    ORDER BY season_points DESC, weekly_points DESC, u.username_norm ASC
  `;
  return rows.map((r, idx) => ({
    rank: idx + 1,
    user_id: r.id,
    username: r.username,
    season_points: Number(r.season_points),
    weekly_points: Number(r.weekly_points),
    wagers: Number(r.wagers),
    wins: Number(r.wins),
    settled: Number(r.settled),
    win_pct: Number(r.settled) ? Number(r.wins) / Number(r.settled) : null
  }));
}

function groupWagers(list) {
  const byGame = {};
  for (const w of list) {
    if (!byGame[w.game_id]) byGame[w.game_id] = [];
    byGame[w.game_id].push({
      market: w.market,
      selection: w.selection,
      line_at_pick: w.line_at_pick == null ? null : Number(w.line_at_pick),
      result: w.result || null,
      points: w.points == null ? null : Number(w.points)
    });
  }
  return byGame;
}

async function handleApi(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  if (pathname === '/api/health' && method === 'GET') {
    if (!hasDatabase()) {
      return json(res, 200, {
        ok: true,
        service: 'game-picks',
        db: 'missing',
        auth: isClerkConfigured() ? 'ok' : 'missing',
        time: new Date().toISOString()
      });
    }
    try {
      const dbPing = await ping();
      return json(res, 200, {
        ok: true,
        service: 'game-picks',
        db: dbPing.ok ? 'ok' : 'error',
        database: dbPing.ok ? 'ok' : dbPing.reason,
        auth: isClerkConfigured() ? 'ok' : 'missing',
        time: new Date().toISOString()
      });
    } catch (err) {
      return json(res, 200, {
        ok: true,
        service: 'game-picks',
        db: 'error',
        database: err.message,
        auth: isClerkConfigured() ? 'ok' : 'missing',
        time: new Date().toISOString()
      });
    }
  }

  if (pathname === '/api/auth/config' && method === 'GET') {
    return json(res, 200, { ok: true, ...publicClerkConfig() });
  }

  const { sql, db, status, error } = await withDb();
  const dbState = { sql, db, status, error };

  if (pathname === '/api/bootstrap' && method === 'GET') {
    let seed = null;
    if (sql) {
      try {
        seed = await seedIfNeeded(sql);
      } catch (err) {
        seed = { ok: false, error: err.message };
      }
    }
    const user = await currentUser(sql, req);
    const games = await allGames(sql);
    const { season, week } = currentSeasonWeek(games);
    const weekGames = games.filter((g) => g.season === season && g.week === week && g.game_type === 'REG')
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const wagers = user ? await userWagers(sql, user.id, weekGames.map((g) => g.game_id)) : [];
    const byGame = groupWagers(wagers);
    const history = games.filter((g) => g.season >= season - 3);
    const cards = weekGames.map((g) => enrichGame(g, history, byGame));
    const poolId = user ? user.pool_id : sql ? (await getPool(sql)).id : null;
    const board = poolId ? await standings(sql, poolId, season, week) : [];
    return json(res, 200, {
      ok: true,
      db,
      dbStatus: status || (db ? 'ok' : 'missing'),
      dbError: error || null,
      seed,
      user: publicUser(user),
      clerk: publicClerkConfig(),
      season,
      week,
      games: cards,
      standings: board.slice(0, 8),
      teams: listTeamAbbrs(),
      rulesVersion: 1
    });
  }

  if (pathname === '/api/login' && method === 'POST') {
    if (!isClerkConfigured()) return authMissing(res);
    if (!sql) return dbUnavailable(res, dbState);
    await readBody(req);
    const user = await currentUser(sql, req);
    if (!user) return signInRequired(res);
    return json(res, 200, { ok: true, user: publicUser(user), clerk: publicClerkConfig() });
  }

  if (pathname === '/api/logout' && (method === 'POST' || method === 'GET')) {
    return json(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
  }

  if (pathname === '/api/week' && method === 'GET') {
    if (sql) await seedIfNeeded(sql);
    const games = await allGames(sql);
    const cursor = currentSeasonWeek(games);
    const season = Number(url.searchParams.get('season') || cursor.season);
    const week = Number(url.searchParams.get('week') || cursor.week);
    const weekGames = (await gamesForWeek(sql, season, week))
      .filter((g) => g.game_type !== 'PRE')
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const user = await currentUser(sql, req);
    const wagers = user ? await userWagers(sql, user.id, weekGames.map((g) => g.game_id)) : [];
    const history = games.filter((g) => Number(g.season) >= season - 3);
    const cards = weekGames.map((g) => enrichGame(g, history, groupWagers(wagers)));
    const weeks = [...new Set(games.filter((g) => g.season === season && g.game_type !== 'PRE').map((g) => g.week))].sort(
      (a, b) => a - b
    );
    return json(res, 200, {
      ok: true,
      db,
      season,
      week,
      weeks,
      games: cards,
      user: publicUser(user),
      clerk: publicClerkConfig()
    });
  }

  if (pathname === '/api/picks' && method === 'POST') {
    if (!sql) return dbUnavailable(res, dbState);
    const user = await currentUser(sql, req);
    if (!user) return signInRequired(res);
    const body = await readBody(req);
    const picks = Array.isArray(body.picks) ? body.picks : [body];
    const saved = [];
    for (const pick of picks) {
      if (!pick || !pick.game_id) continue;
      const rows = await sql`SELECT * FROM games WHERE game_id = ${pick.game_id}`;
      const game = mapGame(rows[0]);
      if (pick.selection == null || pick.selection === '') {
        if (!game) continue;
        if (isLocked(game)) {
          return json(res, 409, { ok: false, error: 'Picks lock at kickoff' });
        }
        const existing = await sql`
          SELECT id FROM wagers WHERE user_id = ${user.id} AND game_id = ${pick.game_id} AND market = ${pick.market}
        `;
        if (existing[0]) {
          await sql`DELETE FROM wager_results WHERE wager_id = ${existing[0].id}`;
          await sql`DELETE FROM wager_history WHERE wager_id = ${existing[0].id}`;
          await sql`DELETE FROM wagers WHERE id = ${existing[0].id}`;
        }
        saved.push({ game_id: pick.game_id, market: pick.market, selection: null });
        continue;
      }
      const valid = validatePick(game, pick.market, pick.selection);
      const upserted = await sql`
        INSERT INTO wagers (user_id, game_id, market, selection, line_at_pick)
        VALUES (${user.id}, ${pick.game_id}, ${valid.market}, ${valid.selection}, ${valid.lineAtPick})
        ON CONFLICT (user_id, game_id, market) DO UPDATE SET
          selection = EXCLUDED.selection,
          line_at_pick = EXCLUDED.line_at_pick,
          updated_at = now()
        RETURNING id, game_id, market, selection, line_at_pick, created_at, updated_at
      `;
      const row = upserted[0];
      await sql`
        INSERT INTO wager_history (wager_id, user_id, game_id, market, selection, line_at_pick, action)
        VALUES (${row.id}, ${user.id}, ${row.game_id}, ${row.market}, ${row.selection}, ${row.line_at_pick}, 'upsert')
      `;
      saved.push(row);
    }
    return json(res, 200, { ok: true, picks: saved });
  }

  if (pathname === '/api/standings' && method === 'GET') {
    if (!sql) return json(res, 200, { ok: true, db: false, standings: [] });
    await seedIfNeeded(sql);
    const games = await allGames(sql);
    const cursor = currentSeasonWeek(games);
    const season = Number(url.searchParams.get('season') || cursor.season);
    const week = Number(url.searchParams.get('week') || cursor.week);
    const user = await currentUser(sql, req);
    const pool = await getPool(sql, url.searchParams.get('pool'));
    const board = await standings(sql, user ? user.pool_id : pool.id, season, week);
    return json(res, 200, { ok: true, db: true, season, week, standings: board });
  }

  if (pathname === '/api/history' && method === 'GET') {
    if (sql) await seedIfNeeded(sql);
    const games = await allGames(sql);
    const seasons = [...new Set(games.map((g) => Number(g.season)).filter(Number.isFinite))];
    const maxSeason = seasons.length ? Math.max(...seasons) : 2026;
    const filters = parseHistoryFilters(url.searchParams, { to: maxSeason });
    const payload = historyPayload(games, filters);
    return json(res, 200, payload);
  }

  if (pathname === '/api/grade-all' && (method === 'GET' || method === 'POST')) {
    requireAdmin(req, url);
    if (!sql) return dbUnavailable(res, dbState);
    const result = await gradeAll(sql);
    return json(res, 200, result);
  }

  if (pathname === '/api/import' && (method === 'GET' || method === 'POST')) {
    requireAdmin(req, url);
    if (!sql) return dbUnavailable(res, dbState);
    const seasonsParam = url.searchParams.get('seasons');
    const seasons = seasonsParam
      ? seasonsParam.split(',').map((s) => Number(s.trim())).filter(Boolean)
      : defaultSeasons();
    const seedOnly = url.searchParams.get('seedOnly') === '1';
    const result = await importGames(sql, { seasons, seedOnly });
    return json(res, 200, result);
  }

  if (pathname === '/api/me/wagers' && method === 'GET') {
    if (!sql) return json(res, 200, { ok: true, wagers: [] });
    const user = await currentUser(sql, req);
    if (!user) return signInRequired(res);
    const rows = await userWagers(sql, user.id);
    return json(res, 200, { ok: true, wagers: rows });
  }

  return json(res, 404, { ok: false, error: 'Not found' });
}

async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (serveStatic(url.pathname, res)) return;
    const index = path.join(PUBLIC, 'index.html');
    if (fs.existsSync(index)) {
      sendFile(res, index);
      return;
    }
    json(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error(err);
    try {
      json(res, status, { ok: false, error: err.message || 'Server error' });
    } catch (sendErr) {
      console.error(sendErr);
      if (!res.headersSent) res.writeHead(status).end();
    }
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      try {
        json(res, 500, { ok: false, error: err.message || 'Server error' });
      } catch {
        res.writeHead(500).end();
      }
    }
  });
});

function shouldListen() {
  if (process.env.VERCEL) return false;
  const entry = require.main && require.main.filename;
  if (!entry) return false;
  return entry.endsWith(`${path.sep}src${path.sep}server.js`) || entry.endsWith(`${path.sep}server.js`);
}

if (shouldListen()) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => {
    console.log(`game-picks listening on http://localhost:${port}`);
  });
}

module.exports = server;
module.exports.handler = handler;
