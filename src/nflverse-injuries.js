'use strict';

const fs = require('fs');
const path = require('path');
const { teamAbbr } = require('./teams');
const { parseCsv } = require('./nfl-data');
const { currentNflSeason } = require('./seasons');

// Historical injuries for Backtest. Source is the nflverse-data `injuries`
// release: one CSV per season, official weekly report status in report_status.
// https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv
// The file has no depth-chart rank. A quarterback with report_status Out is the
// starter-Out slice (the same official weekly status). Practice status is ignored.
// Past seasons are cached and not refetched. The current season refreshes on a TTL.
// Disk, process memory, and app_meta (when a database is configured) share that cache.

const INJURY_RELEASE = 'https://github.com/nflverse/nflverse-data/releases/download/injuries';
const META_KEY = 'nflverse_injuries_v1';
const CURRENT_SEASON_TTL_MS = 12 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

const memory = new Map();
const negativeUntil = new Map();

function injuryReleaseUrl(season) {
  return `${INJURY_RELEASE}/injuries_${season}.csv`;
}

function defaultCacheDir() {
  return path.join(__dirname, '..', 'data', 'cache', 'nflverse-injuries');
}

function cacheFile(season, cacheDir) {
  return path.join(cacheDir || defaultCacheDir(), `${season}.json`);
}

function isQuarterback(position) {
  const p = String(position || '').trim().toUpperCase();
  return p === 'QB' || p === 'QUARTERBACK';
}

function isOutStatus(status) {
  return String(status || '').trim().toLowerCase() === 'out';
}

function nowMs(now) {
  if (now instanceof Date) return now.getTime();
  const n = Date.parse(now);
  return Number.isFinite(n) ? n : Date.now();
}

function cacheIsFresh(entry, season, now = new Date()) {
  if (!entry || !entry.fetchedAt || !Array.isArray(entry.keys)) return false;
  const age = nowMs(now) - Date.parse(entry.fetchedAt);
  if (!Number.isFinite(age) || age < 0) return false;
  if (Number(season) < currentNflSeason(now instanceof Date ? now : new Date(nowMs(now)))) return true;
  return age < CURRENT_SEASON_TTL_MS;
}

function qbOutKeysFromRows(rows) {
  const keys = [];
  for (const row of rows || []) {
    if (!isQuarterback(row.position) || !isOutStatus(row.report_status)) continue;
    const team = teamAbbr(row.team);
    const week = Number(row.week);
    if (!team || !Number.isFinite(week)) continue;
    const gameType = String(row.game_type || 'REG').trim().toUpperCase() || 'REG';
    keys.push(`${gameType}|${week}|${team}`);
  }
  return keys;
}

function injuryKey(season, gameType, week, team) {
  const type = String(gameType || 'REG').trim().toUpperCase() || 'REG';
  return `${Number(season)}|${type}|${Number(week)}|${teamAbbr(team)}`;
}

function starterOutState(game, team, index) {
  if (!game || !team || !index || !index.seasons) return 'unknown';
  const season = Number(game.season);
  if (!index.seasons.has(season)) return 'unknown';
  const key = injuryKey(season, game.game_type, game.week, team);
  return index.qbOut && index.qbOut.has(key) ? 'out' : 'active';
}

function resetInjuryCache() {
  memory.clear();
  negativeUntil.clear();
}

async function readJson(file) {
  try {
    const text = await fs.promises.readFile(file, 'utf8');
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.keys) || !parsed.fetchedAt) return null;
    return { fetchedAt: parsed.fetchedAt, keys: parsed.keys };
  } catch {
    return null;
  }
}

async function writeJson(file, entry) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(entry));
  await fs.promises.rename(tmp, file);
}

async function readMeta(sql) {
  if (!sql) return {};
  try {
    const rows = await sql`SELECT value FROM app_meta WHERE key = ${META_KEY}`;
    if (!rows[0] || rows[0].value == null) return {};
    const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    return (parsed && parsed.seasons) || {};
  } catch {
    return {};
  }
}

async function writeMeta(sql, seasons) {
  if (!sql) return;
  try {
    const value = JSON.stringify({ seasons });
    await sql`
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (${META_KEY}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  } catch (err) {
    console.error('nflverse injuries: cache write failed', err.message || err);
  }
}

async function fetchInjuryCsv(season, options) {
  const fetchFn = options.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs || 12000);
  try {
    const res = await fetchFn(injuryReleaseUrl(season), {
      headers: {
        'user-agent': 'game-picks',
        accept: 'text/csv,text/plain,*/*'
      },
      redirect: 'follow',
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`nflverse injuries ${season} ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadSeasonEntry(season, options, metaSeasons, now) {
  const year = Number(season);
  const cachedMem = memory.get(year);
  if (cacheIsFresh(cachedMem, year, now)) return { entry: cachedMem, fetched: false };

  const file = cacheFile(year, options.cacheDir);
  const cachedDisk = await readJson(file);
  if (cacheIsFresh(cachedDisk, year, now)) {
    memory.set(year, cachedDisk);
    return { entry: cachedDisk, fetched: false };
  }

  const cachedMeta = metaSeasons && metaSeasons[String(year)];
  if (cacheIsFresh(cachedMeta, year, now)) {
    memory.set(year, cachedMeta);
    try {
      await writeJson(file, cachedMeta);
    } catch {
      /* disk is optional */
    }
    return { entry: cachedMeta, fetched: false };
  }

  const failedUntil = negativeUntil.get(year);
  if (failedUntil && nowMs(now) < failedUntil) {
    const stale = (cachedDisk && Array.isArray(cachedDisk.keys) && cachedDisk)
      || (cachedMem && Array.isArray(cachedMem.keys) && cachedMem)
      || (cachedMeta && Array.isArray(cachedMeta.keys) && cachedMeta)
      || null;
    if (stale) {
      memory.set(year, stale);
      return { entry: stale, fetched: false };
    }
    return { entry: null, fetched: false };
  }

  try {
    const csv = await fetchInjuryCsv(year, options);
    if (!csv || !/report_status/.test(String(csv).slice(0, 800))) {
      throw new Error(`nflverse injuries ${year}: unexpected file`);
    }
    const keys = qbOutKeysFromRows(parseCsv(csv));
    const entry = { fetchedAt: new Date(nowMs(now)).toISOString(), keys };
    memory.set(year, entry);
    negativeUntil.delete(year);
    try {
      await writeJson(file, entry);
    } catch (err) {
      console.error('nflverse injuries: disk cache failed', err.message || err);
    }
    return { entry, fetched: true };
  } catch (err) {
    console.error('nflverse injuries: fetch failed', err.message || err);
    negativeUntil.set(year, nowMs(now) + NEGATIVE_TTL_MS);
    const stale = cachedDisk || cachedMem || (cachedMeta && Array.isArray(cachedMeta.keys) ? cachedMeta : null);
    if (stale && Array.isArray(stale.keys)) {
      memory.set(year, stale);
      return { entry: stale, fetched: false };
    }
    return { entry: null, fetched: false };
  }
}

async function loadStarterOutIndex(seasons, options = {}) {
  const now = options.now || new Date();
  const years = [...new Set((seasons || []).map((s) => Number(s)).filter(Number.isFinite))].sort((a, b) => a - b);
  const metaSeasons = await readMeta(options.sql);
  let metaDirty = false;
  const loaded = new Set();
  const qbOut = new Set();
  const fetchedSeasons = [];

  for (const year of years) {
    const result = await loadSeasonEntry(year, options, metaSeasons, now);
    if (!result.entry || !Array.isArray(result.entry.keys)) continue;
    loaded.add(year);
    for (const key of result.entry.keys) qbOut.add(`${year}|${key}`);
    if (result.fetched) fetchedSeasons.push(year);
    const prev = metaSeasons[String(year)];
    if (!prev || prev.fetchedAt !== result.entry.fetchedAt) {
      metaSeasons[String(year)] = { fetchedAt: result.entry.fetchedAt, keys: result.entry.keys };
      metaDirty = true;
    }
  }

  if (metaDirty) await writeMeta(options.sql, metaSeasons);

  return {
    seasons: loaded,
    qbOut,
    fetchedSeasons
  };
}

module.exports = {
  INJURY_RELEASE,
  META_KEY,
  CURRENT_SEASON_TTL_MS,
  injuryReleaseUrl,
  cacheIsFresh,
  qbOutKeysFromRows,
  injuryKey,
  starterOutState,
  loadStarterOutIndex,
  resetInjuryCache,
  defaultCacheDir
};
