'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ensureSchema } = require('./schema');
const { hasDatabase, getSql, ping } = require('./db');
const {
  json,
  readBody,
  readSession,
  signSession,
  sessionCookie,
  clearCookie,
  requireAdmin,
  mapGame,
  getPool
} = require('./http-util');
const { assertUsername } = require('./username');
const { validatePick, gradeAll, isLocked } = require('./grader');
const { importGames, loadSeedGames, loadSchedule2026, defaultSeasons } = require('./nfl-data');
const { enrichGame, currentSeasonWeek } = require('./week-view');
const { teamHistory } = require('./history');
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
  if (!hasDatabase()) return { sql: null, db: false };
  const sql = getSql();
  await ensureSchema(sql);
  return { sql, db: true };
}

async function seedIfNeeded(sql) {
  if (!sql) return { seeded: false };
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM games`;
    if (count > 0) return { seeded: false, count };
    const result = await importGames(sql, { seasons: defaultSeasons(), seedOnly: false });
    return { seeded: true, ...result };
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
  const body = fs.readFileSync(filePath);
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
  const session = readSession(req.headers.cookie);
  if (!session || !session.userId || !sql) return null;
  const rows = await sql`
    SELECT u.id, u.username, u.username_norm, u.pool_id, p.slug AS pool_slug
    FROM users u JOIN pools p ON p.id = u.pool_id
    WHERE u.id = ${session.userId}
  `;
  return rows[0] || null;
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
  const { sql, db } = await withDb();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  if (pathname === '/api/health' && method === 'GET') {
    const dbPing = db ? await ping() : { ok: false, reason: 'DATABASE_URL is not set' };
    return json(res, 200, {
      ok: true,
      service: 'game-picks',
      db: Boolean(dbPing.ok),
      database: dbPing.ok ? 'ok' : dbPing.reason,
      time: new Date().toISOString()
    });
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    if (sql) {
      try {
        await seedIfNeeded(sql);
      } catch (err) {
        return json(res, 200, {
          ok: true,
          db: true,
          warning: `Seed/import failed: ${err.message}`,
          user: null,
          season: defaultSeasons().at(-1),
          week: 1,
          games: [],
          standings: [],
          teams: listTeamAbbrs()
        });
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
      user: user ? { id: user.id, username: user.username, pool: user.pool_slug } : null,
      season,
      week,
      games: cards,
      standings: board.slice(0, 8),
      teams: listTeamAbbrs(),
      rulesVersion: 1
    });
  }

  if (pathname === '/api/login' && method === 'POST') {
    if (!sql) return json(res, 503, { ok: false, error: 'DATABASE_URL is not set' });
    const body = await readBody(req);
    const { display, norm } = assertUsername(body.username);
    const pool = await getPool(sql, body.pool || url.searchParams.get('pool'));
    const existing = await sql`
      SELECT id, username, username_norm FROM users
      WHERE pool_id = ${pool.id} AND username_norm = ${norm}
    `;
    let user = existing[0];
    if (!user) {
      const inserted = await sql`
        INSERT INTO users (pool_id, username, username_norm)
        VALUES (${pool.id}, ${display}, ${norm})
        RETURNING id, username, username_norm
      `;
      user = inserted[0];
    }
    const token = signSession({ userId: user.id, poolId: pool.id });
    return json(
      res,
      200,
      { ok: true, user: { id: user.id, username: user.username, pool: pool.slug } },
      { 'set-cookie': sessionCookie(token) }
    );
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
    return json(res, 200, { ok: true, db, season, week, weeks, games: cards, user: user ? { username: user.username } : null });
  }

  if (pathname === '/api/picks' && method === 'POST') {
    if (!sql) return json(res, 503, { ok: false, error: 'DATABASE_URL is not set' });
    const user = await currentUser(sql, req);
    if (!user) return json(res, 401, { ok: false, error: 'Sign in with a username first' });
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
    const team = (url.searchParams.get('team') || 'ALL').toUpperCase();
    const fromSeason = Number(url.searchParams.get('from') || 2023);
    const filtered = games.filter((g) => Number(g.season) >= fromSeason && g.game_type !== 'PRE');
    const payload = teamHistory(filtered, team === 'ALL' ? 'ALL' : team);
    return json(res, 200, { ok: true, fromSeason, team, ...payload });
  }

  if (pathname === '/api/grade-all' && (method === 'GET' || method === 'POST')) {
    requireAdmin(req, url);
    if (!sql) return json(res, 503, { ok: false, error: 'DATABASE_URL is not set' });
    const result = await gradeAll(sql);
    return json(res, 200, result);
  }

  if (pathname === '/api/import' && (method === 'GET' || method === 'POST')) {
    requireAdmin(req, url);
    if (!sql) return json(res, 503, { ok: false, error: 'DATABASE_URL is not set' });
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
    if (!user) return json(res, 401, { ok: false, error: 'Sign in with a username first' });
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
    json(res, status, { ok: false, error: err.message || 'Server error' });
  }
}

const server = http.createServer((req, res) => {
  handler(req, res);
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
