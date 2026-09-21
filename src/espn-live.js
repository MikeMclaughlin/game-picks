'use strict';

const { teamAbbr } = require('./teams');
const { scoresReady } = require('./grader');

const ESPN_SCOREBOARD = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const POLL_MS = 5 * 60 * 1000;
const GAME_WINDOW_MS = 5 * 60 * 60 * 1000;
const HARD_WINDOW_MS = 8 * 60 * 60 * 1000;
const CACHE_KEY = 'espn_live';

let memoryCache = null;

function espnLiveDisabled() {
  const raw = String(process.env.ESPN_LIVE || '').toLowerCase();
  return raw === '0' || raw === 'false' || raw === 'off';
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function matchKey(away, home) {
  return `${teamAbbr(away)}@${teamAbbr(home)}`;
}

function seasonTypeForGames(games) {
  const types = new Set((games || []).map((g) => String(g.game_type || 'REG').toUpperCase()));
  if (types.has('PRE')) return 1;
  if ([...types].some((t) => t && t !== 'REG')) return 3;
  return 2;
}

function formatLiveDetail(status) {
  const type = (status && status.type) || {};
  const state = String(type.state || '').toLowerCase();
  if (state === 'post' || type.completed) {
    return type.shortDetail || type.detail || 'Final';
  }
  if (state === 'pre') return null;
  const period = num(status && status.period);
  const clock = status && status.displayClock != null ? String(status.displayClock) : '';
  let quarter = null;
  if (period != null && period > 0) {
    if (period > 4) quarter = period === 5 ? 'OT' : `OT${period - 4}`;
    else quarter = `Q${period}`;
  }
  if (quarter && clock && clock !== '0:00') return `${quarter} ${clock}`;
  if (quarter) return quarter;
  return type.shortDetail || type.detail || null;
}

function showScoreRow(live) {
  if (!live) return false;
  const state = String(live.state || '').toLowerCase();
  if (state === 'pre') return false;
  if (state === 'in') return true;
  return live.home_score != null && live.away_score != null;
}

function parseEvent(event) {
  if (!event) return null;
  const comp = (event.competitions || [])[0] || {};
  const status = comp.status || {};
  const type = status.type || {};
  let home = null;
  let away = null;
  for (const c of comp.competitors || []) {
    const abbr = teamAbbr((c.team || {}).abbreviation || c.abbreviation);
    if (!abbr) continue;
    const row = { abbr, score: num(c.score) };
    if (c.homeAway === 'home') home = row;
    else if (c.homeAway === 'away') away = row;
  }
  if (!home || !away) return null;
  const state = String(type.state || '').toLowerCase() || 'pre';
  const parsed = {
    espn_id: event.id || null,
    key: matchKey(away.abbr, home.abbr),
    home_team: home.abbr,
    away_team: away.abbr,
    home_score: home.score,
    away_score: away.score,
    state,
    completed: Boolean(type.completed || state === 'post'),
    period: num(status.period),
    clock: status.displayClock || null,
    detail: formatLiveDetail(status),
    espnDetail: type.detail || null,
    espnShortDetail: type.shortDetail || null,
    date: event.date || null
  };
  parsed.show = showScoreRow(parsed);
  return parsed;
}

function parseScoreboard(payload) {
  return ((payload && payload.events) || []).map(parseEvent).filter(Boolean);
}

function livePayload(event) {
  if (!event) return null;
  return {
    state: event.state,
    home_score: event.home_score,
    away_score: event.away_score,
    period: event.period,
    clock: event.clock,
    detail: event.detail,
    completed: event.completed,
    show: showScoreRow(event)
  };
}

function attachLiveToGames(games, parsedEvents) {
  const byKey = new Map();
  for (const ev of parsedEvents || []) {
    if (ev && ev.key) byKey.set(ev.key, ev);
  }
  const byGame = {};
  for (const g of games || []) {
    const ev = byKey.get(matchKey(g.away_team, g.home_team));
    if (!ev) continue;
    byGame[g.game_id] = livePayload(ev);
  }
  return byGame;
}

function anyCachedIn(snapshot) {
  const byGame = snapshot && snapshot.byGame;
  if (!byGame) return false;
  return Object.values(byGame).some((g) => g && g.state === 'in');
}

function gamePossiblyLive(game, nowMs, cached) {
  if (cached && cached.state === 'in') return true;
  if (cached && cached.state === 'post') return false;
  const kick = Date.parse(game && game.kickoff);
  if (!Number.isFinite(kick)) return false;
  if (nowMs < kick) return false;
  const elapsed = nowMs - kick;
  if (elapsed > HARD_WINDOW_MS) return false;
  if (scoresReady(game) && elapsed > GAME_WINDOW_MS) return false;
  if (elapsed <= GAME_WINDOW_MS) return true;
  return !cached && !scoresReady(game);
}

function shouldQueryEspn(weekGames, now = new Date(), snapshot = null) {
  if (espnLiveDisabled()) return { query: false, reason: 'disabled' };
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (anyCachedIn(snapshot)) return { query: true, reason: 'in-progress' };
  const cachedById = (snapshot && snapshot.byGame) || {};
  const possibly = (weekGames || []).some((g) => gamePossiblyLive(g, nowMs, cachedById[g.game_id]));
  if (!possibly) return { query: false, reason: 'idle' };
  return { query: true, reason: 'in-progress' };
}

function shouldRefreshEspn(weekGames, now = new Date(), snapshot = null) {
  const gate = shouldQueryEspn(weekGames, now, snapshot);
  if (!gate.query) return gate;
  if (snapshot && snapshot.fetchedAt) {
    const age = (now instanceof Date ? now.getTime() : Number(now)) - Date.parse(snapshot.fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age < POLL_MS) {
      return { query: false, reason: 'fresh-cache' };
    }
  }
  return gate;
}

function scoreboardUrl({ seasonType, week, dates } = {}) {
  const url = new URL(ESPN_SCOREBOARD);
  if (seasonType != null && seasonType !== '') url.searchParams.set('seasontype', String(seasonType));
  if (week != null && week !== '') url.searchParams.set('week', String(week));
  if (dates) url.searchParams.set('dates', String(dates));
  return url.toString();
}

async function fetchJson(url, { timeoutMs = 6000, fetchImpl } = {}) {
  const fetchFn = fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'en-US,en;q=0.9'
      },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`ESPN scoreboard ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchEspnScoreboard(options = {}) {
  const urls = [scoreboardUrl(options)];
  if (options.week != null || options.seasonType != null || options.dates) {
    urls.push(scoreboardUrl({}));
  }
  let lastErr = null;
  for (const url of urls) {
    try {
      return await fetchJson(url, options);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('ESPN scoreboard failed');
}

function getMemoryCache() {
  return memoryCache;
}

function setMemoryCache(snapshot) {
  memoryCache = snapshot;
}

function resetMemoryCache() {
  memoryCache = null;
}

async function readSnapshot(sql) {
  if (memoryCache) return memoryCache;
  if (!sql) return null;
  try {
    const rows = await sql`SELECT value FROM app_meta WHERE key = ${CACHE_KEY}`;
    if (!rows[0] || rows[0].value == null) return null;
    const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(sql, snapshot) {
  memoryCache = snapshot;
  if (!sql) return;
  try {
    const value = JSON.stringify(snapshot);
    await sql`
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (${CACHE_KEY}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  } catch (err) {
    console.error('espn live: cache write failed', err.message || err);
  }
}

function livePollFrom(snapshot, weekGames, now) {
  return shouldQueryEspn(weekGames, now, snapshot).query;
}

async function resolveLiveScores(weekGames, options = {}) {
  const now = options.now || new Date();
  const sql = options.sql || null;
  if (espnLiveDisabled()) {
    return {
      ok: true,
      queried: false,
      reason: 'disabled',
      livePoll: false,
      byGame: {},
      fetchedAt: null
    };
  }
  const snapshot = options.snapshot !== undefined ? options.snapshot : await readSnapshot(sql);
  const refresh = shouldRefreshEspn(weekGames, now, snapshot);
  if (!refresh.query) {
    if (refresh.reason === 'idle') console.log('espn live: skip idle (no in-progress games)');
    else console.log(`espn live: skip ${refresh.reason}`);
    return {
      ok: true,
      queried: false,
      reason: refresh.reason,
      livePoll: livePollFrom(snapshot, weekGames, now),
      byGame: (snapshot && snapshot.byGame) || {},
      fetchedAt: (snapshot && snapshot.fetchedAt) || null
    };
  }

  try {
    const season = weekGames && weekGames[0] && weekGames[0].season;
    const week = weekGames && weekGames[0] && weekGames[0].week;
    const payload = await fetchEspnScoreboard({
      seasonType: seasonTypeForGames(weekGames),
      week,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl
    });
    const events = parseScoreboard(payload);
    const byGame = attachLiveToGames(weekGames, events);
    const next = {
      fetchedAt: now.toISOString(),
      season: season || null,
      week: week || null,
      byGame,
      anyIn: Object.values(byGame).some((g) => g && g.state === 'in')
    };
    await writeSnapshot(sql, next);
    console.log(`espn live: fetched events=${events.length} live=${next.anyIn} week=${week}`);
    return {
      ok: true,
      queried: true,
      reason: 'in-progress',
      livePoll: Boolean(next.anyIn) || livePollFrom(next, weekGames, now),
      byGame,
      fetchedAt: next.fetchedAt
    };
  } catch (err) {
    console.error('espn live: fetch failed', err.message || err);
    return {
      ok: false,
      queried: true,
      reason: 'error',
      error: err.message,
      livePoll: livePollFrom(snapshot, weekGames, now),
      byGame: (snapshot && snapshot.byGame) || {},
      fetchedAt: (snapshot && snapshot.fetchedAt) || null
    };
  }
}

function applyLive(cards, byGame) {
  return (cards || []).map((c) => ({
    ...c,
    live: (byGame && byGame[c.game_id]) || null
  }));
}

async function attachLiveScores(cards, options = {}) {
  try {
    const live = await resolveLiveScores(cards, options);
    return { cards: applyLive(cards, live.byGame), live };
  } catch (err) {
    console.error('espn live: attach failed', err.message || err);
    return {
      cards: applyLive(cards, {}),
      live: {
        ok: false,
        queried: false,
        reason: 'error',
        error: err.message,
        livePoll: false,
        byGame: {},
        fetchedAt: null
      }
    };
  }
}

module.exports = {
  ESPN_SCOREBOARD,
  BROWSER_UA,
  POLL_MS,
  GAME_WINDOW_MS,
  HARD_WINDOW_MS,
  CACHE_KEY,
  espnLiveDisabled,
  matchKey,
  seasonTypeForGames,
  formatLiveDetail,
  showScoreRow,
  parseEvent,
  parseScoreboard,
  attachLiveToGames,
  gamePossiblyLive,
  shouldQueryEspn,
  shouldRefreshEspn,
  scoreboardUrl,
  fetchEspnScoreboard,
  resolveLiveScores,
  attachLiveScores,
  applyLive,
  getMemoryCache,
  setMemoryCache,
  resetMemoryCache
};
