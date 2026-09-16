'use strict';

const fs = require('fs');
const path = require('path');
const { teamAbbr } = require('./teams');

const ROOT = path.join(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'games-seed.json');
const SCHEDULE_2026_PATH = path.join(ROOT, 'data', 'schedule-2026.json');

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

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'game-picks/1.0 (pick-em; +https://github.com/MikeMclaughlin/game-picks)',
      accept: 'application/json,text/csv,text/plain,*/*'
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    const err = new Error(`Fetch ${url} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
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

async function fetchRemoteGames(seasons) {
  const wanted = new Set((seasons || []).map(Number));
  const errors = [];
  for (const makeUrl of REMOTE_SOURCES) {
    try {
      if (makeUrl.length === 1 && wanted.size) {
        const collected = [];
        for (const season of wanted) {
          const text = await fetchText(makeUrl(season));
          collected.push(...coerceRemote(text));
        }
        if (collected.length) {
          return { games: filterSeasons(collected, wanted), source: makeUrl([...wanted][0]) };
        }
      } else {
        const text = await fetchText(makeUrl());
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

const UPSERT_SQL = `
INSERT INTO games (
  game_id, season, week, game_type, kickoff, gameday, weekday, gametime,
  home_team, away_team, home_score, away_score, spread_line, total_line,
  home_rest, away_rest, roof, surface, temp, wind, location, overtime, updated_at
) VALUES (
  $1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now()
)
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

async function upsertGames(sql, games) {
  let upserted = 0;
  for (const g of games) {
    await sql.query(UPSERT_SQL, [
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
    ]);
    upserted += 1;
  }
  return upserted;
}

function defaultSeasons(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const currentSeason = month >= 3 ? year : year - 1;
  return [currentSeason - 3, currentSeason - 2, currentSeason - 1, currentSeason];
}

async function importGames(sql, options = {}) {
  const seasons = (options.seasons && options.seasons.length
    ? options.seasons
    : defaultSeasons()
  ).map(Number);
  let source = 'seed';
  let games = [];
  if (!options.seedOnly) {
    const remote = await fetchRemoteGames(seasons);
    if (remote.games.length) {
      games = remote.games;
      source = remote.source;
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
  return { ok: true, source, seasons, fetched: games.length, upserted, games: sql ? undefined : games };
}

module.exports = {
  parseCsv,
  normalizeGame,
  kickoffIso,
  loadSeedGames,
  loadSchedule2026,
  fetchRemoteGames,
  upsertGames,
  importGames,
  defaultSeasons,
  UPSERT_SQL,
  SEED_PATH,
  SCHEDULE_2026_PATH
};
