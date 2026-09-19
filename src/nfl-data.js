'use strict';

const fs = require('fs');
const path = require('path');
const { teamAbbr } = require('./teams');

const { execSql } = require('./schema');
const { HISTORY_FROM_SEASON, defaultSeasons } = require('./seasons');

function resolveDataFile(...rel) {
  const candidates = [
    path.join(__dirname, '..', ...rel),
    path.join(process.cwd(), ...rel),
    path.join(__dirname, ...rel)
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

const SEED_PATH = resolveDataFile('data', 'games-seed.json');
const SCHEDULE_2026_PATH = resolveDataFile('data', 'schedule-2026.json');

const REMOTE_SOURCES = [
  (season) => `https://www.nfldata.org/v1/games?season=${season}`,
  () => 'https://github.com/nflverse/nflverse-data/releases/download/schedules/schedules.csv',
  () => 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
  () => 'https://raw.githubusercontent.com/nflverse/nfldata/refs/heads/master/data/games.csv'
];

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((cell) => cell !== '')).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] == null ? '' : r[idx];
    });
    return obj;
  });
}

function easternOffset(gameday) {
  const day = gameday || '1970-01-01';
  const [y, m, d] = day.split('-').map(Number);
  const month = m || 1;
  const date = d || 1;
  if (month > 3 && month < 11) return '-04:00';
  if (month < 3 || month > 11) return '-05:00';
  if (month === 3) return date >= 8 ? '-04:00' : '-05:00';
  return date >= 8 ? '-05:00' : '-04:00';
}

function kickoffIso(gameday, gametime) {
  const day = gameday || '1970-01-01';
  const time = gametime && /^\d{1,2}:\d{2}/.test(gametime) ? gametime : '13:00';
  const [hh, mm] = time.split(':');
  const hour = String(hh).padStart(2, '0');
  const minute = String(mm || '00').padStart(2, '0');
  return `${day}T${hour}:${minute}:00${easternOffset(day)}`;
}

function normalizeGame(raw) {
  if (!raw) return null;
  const gameId = raw.game_id || raw.gameId || raw.id;
  const home = teamAbbr(raw.home_team || raw.homeTeam);
  const away = teamAbbr(raw.away_team || raw.awayTeam);
  if (!gameId || !home || !away) return null;
  const season = num(raw.season);
  const week = num(raw.week);
  if (season == null || week == null) return null;
  const gameday = raw.gameday || raw.game_date || raw.date || null;
  const gametime = raw.gametime || raw.game_time || null;
  return {
    game_id: String(gameId),
    season,
    week,
    game_type: raw.game_type || raw.gameType || 'REG',
    gameday,
    weekday: raw.weekday || null,
    gametime,
    kickoff: raw.kickoff || kickoffIso(gameday, gametime),
    home_team: home,
    away_team: away,
    home_score: num(raw.home_score ?? raw.homeScore),
    away_score: num(raw.away_score ?? raw.awayScore),
    spread_line: num(raw.spread_line ?? raw.spreadLine ?? raw.spread),
    total_line: num(raw.total_line ?? raw.totalLine ?? raw.total),
    home_rest: num(raw.home_rest ?? raw.homeRest),
    away_rest: num(raw.away_rest ?? raw.awayRest),
    roof: raw.roof || null,
    surface: raw.surface || null,
    temp: num(raw.temp),
    wind: num(raw.wind),
    location: raw.location || 'Home',
    overtime: num(raw.overtime)
  };
}

function loadSeedGames() {
  if (fs.existsSync(SEED_PATH)) {
    const parsed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    return (Array.isArray(parsed) ? parsed : parsed.games || []).map(normalizeGame).filter(Boolean);
  }
  return loadSchedule2026();
}

function loadSchedule2026() {
  if (!fs.existsSync(SCHEDULE_2026_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(SCHEDULE_2026_PATH, 'utf8'));
  return (parsed.games || parsed).map(normalizeGame).filter(Boolean);
}

async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'game-picks/1.0 (pick-em; +https://github.com/MikeMclaughlin/game-picks)',
        accept: 'application/json,text/csv,text/plain,*/*'
      },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`Fetch ${url} failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function coerceRemote(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed.games || parsed.data || parsed.results || [];
    return list.map(normalizeGame).filter(Boolean);
  }
  if (trimmed.includes('game_id') && trimmed.includes(',')) {
    return parseCsv(trimmed).map(normalizeGame).filter(Boolean);
  }
  return [];
}

async function fetchRemoteGames(seasons, timeoutMs = 8000) {
  const wanted = new Set((seasons || []).map(Number));
  const errors = [];
  const sources = wanted.size > 2
    ? [...REMOTE_SOURCES.filter((fn) => fn.length === 0), ...REMOTE_SOURCES.filter((fn) => fn.length === 1)]
    : REMOTE_SOURCES;
  const csvTimeout = Math.max(timeoutMs, 12000);
  for (const makeUrl of sources) {
    try {
      if (makeUrl.length === 1 && wanted.size) {
        const collected = [];
        for (const season of wanted) {
          const text = await fetchText(makeUrl(season), Math.min(timeoutMs, 2500));
          collected.push(...coerceRemote(text));
        }
        if (collected.length) {
          return { games: filterSeasons(collected, wanted), source: makeUrl([...wanted][0]) };
        }
      } else {
        const text = await fetchText(makeUrl(), makeUrl.length === 0 ? csvTimeout : timeoutMs);
        const games = coerceRemote(text);
        if (games.length) {
          return { games: filterSeasons(games, wanted), source: makeUrl() };
        }
      }
    } catch (err) {
      errors.push(err.message);
    }
  }
  return { games: [], source: null, errors };
}

function filterSeasons(games, wanted) {
  if (!wanted || !wanted.size) return games;
  return games.filter((g) => wanted.has(Number(g.season)));
}

const GAME_COLUMNS = [
  'game_id', 'season', 'week', 'game_type', 'kickoff', 'gameday', 'weekday', 'gametime',
  'home_team', 'away_team', 'home_score', 'away_score', 'spread_line', 'total_line',
  'home_rest', 'away_rest', 'roof', 'surface', 'temp', 'wind', 'location', 'overtime'
];

const UPSERT_CONFLICT = `
ON CONFLICT (game_id) DO UPDATE SET
  season = EXCLUDED.season,
  week = EXCLUDED.week,
  game_type = EXCLUDED.game_type,
  kickoff = EXCLUDED.kickoff,
  gameday = COALESCE(EXCLUDED.gameday, games.gameday),
  weekday = COALESCE(EXCLUDED.weekday, games.weekday),
  gametime = COALESCE(EXCLUDED.gametime, games.gametime),
  home_team = EXCLUDED.home_team,
  away_team = EXCLUDED.away_team,
  home_score = COALESCE(EXCLUDED.home_score, games.home_score),
  away_score = COALESCE(EXCLUDED.away_score, games.away_score),
  spread_line = COALESCE(EXCLUDED.spread_line, games.spread_line),
  total_line = COALESCE(EXCLUDED.total_line, games.total_line),
  spread_open = COALESCE(games.spread_open, EXCLUDED.spread_open, EXCLUDED.spread_line),
  total_open = COALESCE(games.total_open, EXCLUDED.total_open, EXCLUDED.total_line),
  spread_open_at = CASE
    WHEN games.spread_open IS NOT NULL THEN games.spread_open_at
    WHEN COALESCE(EXCLUDED.spread_open, EXCLUDED.spread_line) IS NOT NULL THEN COALESCE(EXCLUDED.spread_open_at, now())
    ELSE games.spread_open_at
  END,
  total_open_at = CASE
    WHEN games.total_open IS NOT NULL THEN games.total_open_at
    WHEN COALESCE(EXCLUDED.total_open, EXCLUDED.total_line) IS NOT NULL THEN COALESCE(EXCLUDED.total_open_at, now())
    ELSE games.total_open_at
  END,
  home_rest = COALESCE(EXCLUDED.home_rest, games.home_rest),
  away_rest = COALESCE(EXCLUDED.away_rest, games.away_rest),
  roof = COALESCE(EXCLUDED.roof, games.roof),
  surface = COALESCE(EXCLUDED.surface, games.surface),
  temp = COALESCE(EXCLUDED.temp, games.temp),
  wind = COALESCE(EXCLUDED.wind, games.wind),
  location = COALESCE(EXCLUDED.location, games.location),
  overtime = COALESCE(EXCLUDED.overtime, games.overtime),
  updated_at = now()
`;

function openingInsertTail(spreadIdx, totalIdx) {
  return `$${spreadIdx}, $${totalIdx}, CASE WHEN $${spreadIdx} IS NULL THEN NULL ELSE now() END, CASE WHEN $${totalIdx} IS NULL THEN NULL ELSE now() END, now()`;
}

const UPSERT_SQL = `
INSERT INTO games (
  ${GAME_COLUMNS.join(', ')}, spread_open, total_open, spread_open_at, total_open_at, updated_at
) VALUES (
  $1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, ${openingInsertTail(13, 14)}
)
${UPSERT_CONFLICT}
`;

function gameParams(g) {
  return [
    g.game_id,
    g.season,
    g.week,
    g.game_type,
    g.kickoff,
    g.gameday,
    g.weekday,
    g.gametime,
    g.home_team,
    g.away_team,
    g.home_score,
    g.away_score,
    g.spread_line,
    g.total_line,
    g.home_rest,
    g.away_rest,
    g.roof,
    g.surface,
    g.temp,
    g.wind,
    g.location,
    g.overtime
  ];
}

function buildBatchUpsert(batch) {
  const cols = 22;
  const placeholders = batch.map((_, i) => {
    const b = i * cols;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::timestamptz,$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$${b + 20},$${b + 21},$${b + 22}, ${openingInsertTail(b + 13, b + 14)})`;
  }).join(',');
  const text = `INSERT INTO games (${GAME_COLUMNS.join(', ')}, spread_open, total_open, spread_open_at, total_open_at, updated_at) VALUES ${placeholders} ${UPSERT_CONFLICT}`;
  const params = batch.flatMap(gameParams);
  return { text, params };
}

async function upsertGames(sql, games, batchSize = 80) {
  let upserted = 0;
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    const { text, params } = buildBatchUpsert(batch);
    await execSql(sql, text, params);
    upserted += batch.length;
  }
  return upserted;
}

async function maybeGradeImported(sql, options = {}) {
  if (!sql || options.grade === false) return null;
  const gradeFn = options.gradeAllFn || require('./grader').gradeAll;
  return gradeFn(sql);
}

async function importGames(sql, options = {}) {
  const seasons = (options.seasons && options.seasons.length
    ? options.seasons
    : defaultSeasons()
  ).map(Number);
  const preferBundled = options.preferBundled === true || options.seedOnly === true;
  const remoteTimeoutMs = options.remoteTimeoutMs || 8000;
  let source = 'seed';
  let games = [];
  let remote = { games: [], source: null, errors: [] };

  if (preferBundled) {
    games = filterSeasons(loadSeedGames(), new Set(seasons));
    source = 'bundled-seed';
  }

  if (!options.seedOnly) {
    remote = await fetchRemoteGames(seasons, remoteTimeoutMs);
    if (remote.games.length) {
      if (!games.length) {
        games = remote.games;
        source = remote.source;
      } else {
        const byId = new Map(games.map((g) => [g.game_id, g]));
        for (const g of remote.games) byId.set(g.game_id, { ...byId.get(g.game_id), ...g });
        games = [...byId.values()];
        source = `${source}+${remote.source}`;
      }
    }
  }

  if (!games.length) {
    games = filterSeasons(loadSeedGames(), new Set(seasons));
    source = 'bundled-seed';
  }
  if (!games.length) {
    games = loadSchedule2026();
    source = 'schedule-2026.json';
  }
  let upserted = 0;
  if (sql && games.length) {
    upserted = await upsertGames(sql, games);
    await sql`
      INSERT INTO app_meta (key, value, updated_at)
      VALUES ('last_import', ${JSON.stringify({ source, count: upserted, seasons, at: new Date().toISOString() })}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  let grade = null;
  let gradeError = null;
  try {
    grade = await maybeGradeImported(sql, options);
  } catch (err) {
    gradeError = err.message;
  }
  return {
    ok: true,
    source,
    seasons,
    fetched: games.length,
    upserted,
    remoteErrors: remote.errors,
    grade,
    gradeError,
    games: sql ? undefined : games
  };
}

module.exports = {
  parseCsv,
  normalizeGame,
  kickoffIso,
  loadSeedGames,
  loadSchedule2026,
  fetchRemoteGames,
  upsertGames,
  buildBatchUpsert,
  importGames,
  maybeGradeImported,
  defaultSeasons,
  HISTORY_FROM_SEASON,
  UPSERT_SQL,
  UPSERT_CONFLICT,
  openingInsertTail,
  SEED_PATH,
  SCHEDULE_2026_PATH
};
