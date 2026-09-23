'use strict';

const { teamAbbr } = require('./teams');
const { BROWSER_UA, espnLiveDisabled } = require('./espn-live');

const ESPN_INJURIES = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const CACHE_KEY = 'espn_injuries';
/** Slower than the 5-minute live score poll. Refresh on week load when older than this. */
const POLL_MS = 45 * 60 * 1000;

let memoryCache = null;

function normPerson(name) {
  if (name == null) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function namesMatch(a, b) {
  const left = normPerson(a);
  const right = normPerson(b);
  return Boolean(left && right && left === right);
}

function canonicalStatus(row) {
  const type = row && row.type;
  const raw = (row && row.status)
    || (type && type.description)
    || (type && type.abbreviation)
    || '';
  const s = String(raw).trim().toLowerCase();
  if (s === 'out' || s === 'o') return 'Out';
  if (s === 'doubtful' || s === 'd') return 'Doubtful';
  if (s === 'questionable' || s === 'q') return 'Questionable';
  return null;
}

function positionAbbr(athlete) {
  const pos = athlete && athlete.position;
  const raw = pos && (pos.abbreviation || pos.name);
  if (!raw) return '';
  const upper = String(raw).trim().toUpperCase();
  if (upper === 'QUARTERBACK') return 'QB';
  return upper;
}

function isQuarterback(position) {
  return String(position || '').toUpperCase() === 'QB';
}

function listedStarterName(game, team) {
  if (!game || !team) return '';
  const abbr = teamAbbr(team);
  if (abbr && abbr === teamAbbr(game.home_team)) return game.home_qb_name || '';
  if (abbr && abbr === teamAbbr(game.away_team)) return game.away_qb_name || '';
  return '';
}

/**
 * Out and Doubtful always. Questionable only for a QB, or a player whose
 * name matches the listed starting quarterback on that side.
 */
function injuryVisible(inj, game) {
  if (!inj) return false;
  const status = canonicalStatus(inj) || (inj.status === 'Out' || inj.status === 'Doubtful' || inj.status === 'Questionable' ? inj.status : null);
  if (status === 'Out' || status === 'Doubtful') return true;
  if (status !== 'Questionable') return false;
  if (isQuarterback(inj.position)) return true;
  return namesMatch(inj.name, listedStarterName(game, inj.team));
}

function parseInjuries(payload) {
  const byTeam = {};
  const groups = (payload && payload.injuries) || [];
  for (const group of groups) {
    for (const row of group.injuries || []) {
      const status = canonicalStatus(row);
      if (!status) continue;
      const athlete = row.athlete || {};
      const abbr = teamAbbr((athlete.team && athlete.team.abbreviation) || '');
      if (!abbr) continue;
      const name = athlete.displayName || athlete.shortName || '';
      if (!name) continue;
      const position = positionAbbr(athlete);
      if (!byTeam[abbr]) byTeam[abbr] = [];
      byTeam[abbr].push({ name, position, status });
    }
  }
  return byTeam;
}

const STATUS_RANK = { Out: 0, Doubtful: 1, Questionable: 2 };

function injuriesForGame(game, byTeam) {
  if (!game) return [];
  const out = [];
  for (const side of ['away', 'home']) {
    const team = side === 'away' ? game.away_team : game.home_team;
    const abbr = teamAbbr(team);
    const list = (byTeam && abbr && byTeam[abbr]) || [];
    for (const inj of list) {
      const row = { team: abbr, side, name: inj.name, position: inj.position, status: inj.status };
      if (!injuryVisible(row, game)) continue;
      out.push(row);
    }
  }
  out.sort((a, b) => {
    if (a.side !== b.side) return a.side === 'away' ? -1 : 1;
    const aq = isQuarterback(a.position) ? 0 : 1;
    const bq = isQuarterback(b.position) ? 0 : 1;
    if (aq !== bq) return aq - bq;
    const as = STATUS_RANK[a.status] == null ? 9 : STATUS_RANK[a.status];
    const bs = STATUS_RANK[b.status] == null ? 9 : STATUS_RANK[b.status];
    if (as !== bs) return as - bs;
    return String(a.name).localeCompare(String(b.name));
  });
  return out;
}

function cleanLostStarter(text) {
  if (!text || !/lost starter/i.test(text)) return text;
  let next = String(text).replace(/\s*—\s*[^·]*\blost starter\b[^·]*/gi, '');
  next = next
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/^(?:\s*·\s*)+/, '')
    .replace(/(?:\s*·\s*)+$/, '')
    .trim();
  if (!next) return 'pass ATS';
  return next;
}

/**
 * Injury strip owns the status fact. When that QB is already on the strip,
 * the AI line keeps only the pick implication.
 */
function scrubOverlappingPick(aiPick, injuries, game) {
  if (!aiPick || !game) return null;
  const away = teamAbbr(game.away_team);
  const covered = (injuries || []).some((inj) => {
    if (teamAbbr(inj.team) !== away) return false;
    return isQuarterback(inj.position) || namesMatch(inj.name, game.away_qb_name);
  });
  if (!covered) return null;
  const label = cleanLostStarter(aiPick.label);
  const atsNote = cleanLostStarter(aiPick.atsNote);
  if (label === aiPick.label && atsNote === aiPick.atsNote) return null;
  return { ...aiPick, label, atsNote };
}

function decorateCard(card, byTeam) {
  const injuries = injuriesForGame(card, byTeam);
  const aiPickDisplay = scrubOverlappingPick(card && card.aiPick, injuries, card);
  const next = { ...(card || {}), injuries };
  if (aiPickDisplay) next.aiPickDisplay = aiPickDisplay;
  return next;
}

function shouldRefreshInjuries(now = new Date(), snapshot = null) {
  if (espnLiveDisabled()) return { query: false, reason: 'disabled' };
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!snapshot || !snapshot.fetchedAt) return { query: true, reason: 'week-load' };
  const age = nowMs - Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(age) || age < 0 || age >= POLL_MS) return { query: true, reason: 'stale' };
  return { query: false, reason: 'fresh-cache' };
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
      const err = new Error(`ESPN injuries ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
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
    console.error('espn injuries: cache write failed', err.message || err);
  }
}

async function resolveInjuries(options = {}) {
  const now = options.now || new Date();
  const sql = options.sql || null;
  if (espnLiveDisabled()) {
    return {
      ok: true,
      queried: false,
      reason: 'disabled',
      byTeam: {},
      fetchedAt: null
    };
  }
  const snapshot = options.snapshot !== undefined ? options.snapshot : await readSnapshot(sql);
  const refresh = shouldRefreshInjuries(now, snapshot);
  if (!refresh.query) {
    console.log(`espn injuries: skip ${refresh.reason}`);
    return {
      ok: true,
      queried: false,
      reason: refresh.reason,
      byTeam: (snapshot && snapshot.byTeam) || {},
      fetchedAt: (snapshot && snapshot.fetchedAt) || null
    };
  }
  try {
    const payload = await fetchJson(ESPN_INJURIES, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl
    });
    const byTeam = parseInjuries(payload);
    const next = {
      fetchedAt: now.toISOString(),
      byTeam
    };
    await writeSnapshot(sql, next);
    console.log(`espn injuries: fetched teams=${Object.keys(byTeam).length}`);
    return {
      ok: true,
      queried: true,
      reason: refresh.reason,
      byTeam,
      fetchedAt: next.fetchedAt
    };
  } catch (err) {
    console.error('espn injuries: fetch failed', err.message || err);
    return {
      ok: false,
      queried: true,
      reason: 'error',
      error: err.message,
      byTeam: (snapshot && snapshot.byTeam) || {},
      fetchedAt: (snapshot && snapshot.fetchedAt) || null
    };
  }
}

async function attachInjuries(cards, options = {}) {
  try {
    const resolved = await resolveInjuries(options);
    return {
      cards: (cards || []).map((card) => decorateCard(card, resolved.byTeam)),
      injuries: resolved
    };
  } catch (err) {
    console.error('espn injuries: attach failed', err.message || err);
    return {
      cards: (cards || []).map((card) => decorateCard(card, {})),
      injuries: {
        ok: false,
        queried: false,
        reason: 'error',
        error: err.message,
        byTeam: {},
        fetchedAt: null
      }
    };
  }
}

module.exports = {
  ESPN_INJURIES,
  CACHE_KEY,
  POLL_MS,
  canonicalStatus,
  injuryVisible,
  parseInjuries,
  injuriesForGame,
  scrubOverlappingPick,
  shouldRefreshInjuries,
  resolveInjuries,
  attachInjuries,
  getMemoryCache,
  setMemoryCache,
  resetMemoryCache
};
