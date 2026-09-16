'use strict';

const { roadTravel, distanceBucket, sameDivision } = require('./teams');
const { toNumber, scoresReady } = require('./grader');
const { resultLetter } = require('./week-view');

const DEFAULT_FROM = 2023;
const DEFAULT_TO = 2026;

const FILTER_DEFAULTS = {
  team: 'ALL',
  from: DEFAULT_FROM,
  to: DEFAULT_TO,
  site: 'all',
  weather: 'all',
  travel: 'all',
  distance: 'all',
  roof: 'all',
  role: 'all',
  division: 'all',
  daysOff: 'all'
};

const NOTES = {
  team: 'Filters aggregation to one team abbreviation.',
  from: 'Inclusive season start (game.season).',
  to: 'Inclusive season end (game.season).',
  site: 'Team-relative home (non-neutral) or road games.',
  weather: 'Cold = ≤40°F outdoor; windy = 15+ mph outdoor; fair = outdoor/open and neither cold nor windy. Dome/closed roofs are excluded from weather buckets. Missing temp/wind outdoor games count as fair.',
  travel: 'Road games crossing 2+ time zones east or west (existing timezone map, not flight path).',
  distance: 'Timezone-based: local = 0–1 zones apart, cross-country = 2+. Not actual mileage.',
  roof: 'nflverse roof: dome; outdoors; retractable = open|closed.',
  role: 'Favorite/underdog from spread_line (positive means home favored). Pick’em and missing lines are excluded.',
  division: 'Static current NFL division map on team abbreviations (not a schedule feed field).',
  daysOff: 'Uses home_rest/away_rest: short ≤5 days, bye+ ≥11, else normal.'
};

function isByeBefore(games, team, kickoff) {
  const t = team;
  const before = Date.parse(kickoff);
  const prior = games
    .filter((g) => (g.home_team === t || g.away_team === t) && Date.parse(g.kickoff) < before)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  if (!prior.length) return false;
  const last = prior[0];
  const gapDays = (before - Date.parse(last.kickoff)) / 86400000;
  return gapDays >= 11;
}

function weatherBucket(game) {
  if (!game.roof || game.roof === 'dome' || game.roof === 'closed') return 'dome';
  const temp = toNumber(game.temp);
  const wind = toNumber(game.wind);
  if (temp != null && temp <= 40) return 'cold';
  if (wind != null && wind >= 15) return 'windy';
  return 'outdoors';
}

function roofBucket(game) {
  const r = String(game.roof || '').toLowerCase();
  if (r === 'dome') return 'dome';
  if (r === 'outdoors') return 'outdoor';
  if (r === 'open' || r === 'closed') return 'retractable';
  return 'unknown';
}

function restBucket(days) {
  if (days == null) return 'unknown';
  if (days <= 5) return 'short';
  if (days >= 11) return 'bye';
  return 'normal';
}

function afterBucket(history, team, game) {
  const before = Date.parse(game.kickoff);
  const prior = history
    .filter((g) => (g.home_team === team || g.away_team === team) && scoresReady(g) && Date.parse(g.kickoff) < before)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  if (!prior.length) {
    return isByeBefore(history, team, game.kickoff) ? 'bye' : 'none';
  }
  const last = prior[0];
  const letter = resultLetter(team, last);
  if (isByeBefore(history, team, game.kickoff)) return 'bye';
  if (letter === 'W') return 'win';
  if (letter === 'L') return 'loss';
  if (letter === 'T') return 'tie';
  return 'none';
}

function atsCover(game, team) {
  if (!scoresReady(game) || toNumber(game.spread_line) == null) return null;
  const margin = toNumber(game.home_score) - toNumber(game.away_score);
  const spread = toNumber(game.spread_line);
  if (margin === spread) return 'P';
  const cover = margin > spread ? game.home_team : game.away_team;
  return cover === team ? 'W' : 'L';
}

function ouResult(game) {
  if (!scoresReady(game) || toNumber(game.total_line) == null) return null;
  const total = toNumber(game.home_score) + toNumber(game.away_score);
  const line = toNumber(game.total_line);
  if (total === line) return 'P';
  return total > line ? 'O' : 'U';
}

function record(wins, losses, pushes = 0) {
  const played = wins + losses;
  return {
    wins,
    losses,
    pushes,
    pct: played ? wins / played : null,
    label: pushes ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`
  };
}

function tally(items, getOutcome) {
  let w = 0;
  let l = 0;
  let p = 0;
  for (const item of items) {
    const o = getOutcome(item);
    if (o === 'W' || o === 'O') w += 1;
    else if (o === 'L' || o === 'U') l += 1;
    else if (o === 'P') p += 1;
  }
  return record(w, l, p);
}

function alias(value, map, fallback) {
  if (value == null || value === '') return fallback;
  const key = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return fallback;
}

function parseHistoryFilters(searchParams, extras = {}) {
  const get = (name) => {
    if (searchParams && typeof searchParams.get === 'function') return searchParams.get(name);
    if (searchParams && searchParams[name] != null) return searchParams[name];
    return null;
  };
  let from = Number(get('from') || get('fromYear') || extras.from || FILTER_DEFAULTS.from);
  let to = Number(get('to') || get('toYear') || extras.to || FILTER_DEFAULTS.to);
  if (!Number.isFinite(from)) from = FILTER_DEFAULTS.from;
  if (!Number.isFinite(to)) to = FILTER_DEFAULTS.to;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const teamRaw = (get('team') || FILTER_DEFAULTS.team || 'ALL').toString().toUpperCase();
  return {
    team: teamRaw || 'ALL',
    from,
    to,
    site: alias(get('site'), { all: 'all', home: 'home', road: 'road', away: 'road' }, 'all'),
    weather: alias(get('weather'), { all: 'all', cold: 'cold', windy: 'windy', wind: 'windy', fair: 'fair' }, 'all'),
    travel: alias(get('travel'), { all: 'all', east: 'east', west: 'west' }, 'all'),
    distance: alias(get('distance'), {
      all: 'all',
      local: 'local',
      cross: 'cross',
      'cross-country': 'cross',
      cross_country: 'cross',
      crosscountry: 'cross'
    }, 'all'),
    roof: alias(get('roof'), {
      all: 'all',
      dome: 'dome',
      outdoor: 'outdoor',
      outdoors: 'outdoor',
      retractable: 'retractable'
    }, 'all'),
    role: alias(get('role'), {
      all: 'all',
      favorite: 'favorite',
      fav: 'favorite',
      underdog: 'underdog',
      dog: 'underdog',
      ud: 'underdog'
    }, 'all'),
    division: alias(get('division'), {
      all: 'all',
      divisional: 'divisional',
      div: 'divisional',
      'non-div': 'non-div',
      nondiv: 'non-div',
      non_div: 'non-div',
      'non-divisional': 'non-div'
    }, 'all'),
    daysOff: alias(get('daysOff') || get('days_off') || get('rest'), {
      all: 'all',
      short: 'short',
      'short-rest': 'short',
      short_rest: 'short',
      shortrest: 'short',
      normal: 'normal',
      bye: 'bye',
      'bye+': 'bye',
      'bye-plus': 'bye',
      bye_plus: 'bye'
    }, 'all')
  };
}

function roleForTeam(game, team) {
  const spread = toNumber(game.spread_line);
  if (spread == null || spread === 0) return 'pick';
  const homeFavored = spread > 0;
  const isFav = game.home_team === team ? homeFavored : !homeFavored;
  return isFav ? 'favorite' : 'underdog';
}

function matchesGlobalFilters(game, filters) {
  const season = Number(game.season);
  if (game.game_type === 'PRE') return false;
  if (Number.isFinite(filters.from) && season < filters.from) return false;
  if (Number.isFinite(filters.to) && season > filters.to) return false;
  if (filters.weather && filters.weather !== 'all') {
    const bucket = weatherBucket(game);
    if (filters.weather === 'fair') {
      if (bucket !== 'outdoors') return false;
    } else if (bucket !== filters.weather) return false;
  }
  if (filters.roof && filters.roof !== 'all') {
    if (roofBucket(game) !== filters.roof) return false;
  }
  if (filters.division && filters.division !== 'all') {
    const divisional = sameDivision(game.home_team, game.away_team);
    if (filters.division === 'divisional' && !divisional) return false;
    if (filters.division === 'non-div' && divisional) return false;
  }
  return true;
}

function matchesTeamFilters(game, team, filters) {
  if (game.home_team !== team && game.away_team !== team) return false;
  if (filters.site === 'home') {
    if (!(game.home_team === team && game.location !== 'Neutral')) return false;
  } else if (filters.site === 'road') {
    if (game.away_team !== team) return false;
  }
  if (filters.travel === 'east' || filters.travel === 'west') {
    if (game.away_team !== team) return false;
    const t = roadTravel(game.away_team, game.home_team);
    if (!t || t.dir !== filters.travel) return false;
  }
  if (filters.distance === 'local' || filters.distance === 'cross') {
    if (distanceBucket(game.away_team, game.home_team) !== filters.distance) return false;
  }
  if (filters.role === 'favorite' || filters.role === 'underdog') {
    if (roleForTeam(game, team) !== filters.role) return false;
  }
  if (filters.daysOff === 'short' || filters.daysOff === 'normal' || filters.daysOff === 'bye') {
    const d = game.home_team === team ? toNumber(game.home_rest) : toNumber(game.away_rest);
    if (restBucket(d) !== filters.daysOff) return false;
  }
  return true;
}

function teamHistory(games, teamFilter, options = {}) {
  const filters = {
    ...FILTER_DEFAULTS,
    ...(options.filters || {}),
    team: teamFilter && teamFilter !== 'ALL' ? teamFilter : (options.filters && options.filters.team) || 'ALL'
  };
  const lookup = options.lookupGames || games;
  const globalGames = games.filter((g) => matchesGlobalFilters(g, filters));
  const teams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))].sort();
  const selected = filters.team && filters.team !== 'ALL' ? [filters.team] : teams;
  const rows = [];
  const matchedIds = new Set();
  for (const team of selected) {
    const played = globalGames.filter((g) => scoresReady(g) && matchesTeamFilters(g, team, filters));
    for (const g of played) matchedIds.add(g.game_id);
    const home = played.filter((g) => g.home_team === team && g.location !== 'Neutral');
    const road = played.filter((g) => g.away_team === team);
    const ats = tally(played, (g) => atsCover(g, team));
    const ou = tally(played, ouResult);
    const homeRec = tally(home, (g) => resultLetter(team, g));
    const roadRec = tally(road, (g) => resultLetter(team, g));
    const favorite = tally(played.filter((g) => roleForTeam(g, team) === 'favorite'), (g) => resultLetter(team, g));
    const dog = tally(played.filter((g) => roleForTeam(g, team) === 'underdog'), (g) => resultLetter(team, g));
    const weather = {};
    for (const bucket of ['dome', 'outdoors', 'cold', 'windy']) {
      weather[bucket] = tally(
        played.filter((g) => weatherBucket(g) === bucket),
        (g) => resultLetter(team, g)
      );
    }
    const travelEast = tally(
      road.filter((g) => {
        const t = roadTravel(g.away_team, g.home_team);
        return t && t.dir === 'east';
      }),
      (g) => resultLetter(team, g)
    );
    const travelWest = tally(
      road.filter((g) => {
        const t = roadTravel(g.away_team, g.home_team);
        return t && t.dir === 'west';
      }),
      (g) => resultLetter(team, g)
    );
    const rest = {
      short: tally(
        played.filter((g) => {
          const d = g.home_team === team ? toNumber(g.home_rest) : toNumber(g.away_rest);
          return restBucket(d) === 'short';
        }),
        (g) => resultLetter(team, g)
      ),
      normal: tally(
        played.filter((g) => {
          const d = g.home_team === team ? toNumber(g.home_rest) : toNumber(g.away_rest);
          return restBucket(d) === 'normal';
        }),
        (g) => resultLetter(team, g)
      ),
      bye: tally(
        played.filter((g) => afterBucket(lookup, team, g) === 'bye'),
        (g) => resultLetter(team, g)
      )
    };
    const after = {
      win: tally(played.filter((g) => afterBucket(lookup, team, g) === 'win'), (g) => resultLetter(team, g)),
      loss: tally(played.filter((g) => afterBucket(lookup, team, g) === 'loss'), (g) => resultLetter(team, g)),
      bye: rest.bye
    };
    if (!played.length && filters.team === 'ALL') continue;
    rows.push({
      team,
      games: played.length,
      ats,
      ou,
      home: homeRec,
      road: roadRec,
      favorite,
      dog,
      weather,
      travel: { east: travelEast, west: travelWest },
      rest,
      after
    });
  }
  return { teams, rows, matchedGames: matchedIds.size, filters };
}

function historyPayload(games, filters) {
  const seasons = [...new Set(games.map((g) => Number(g.season)).filter(Number.isFinite))].sort((a, b) => a - b);
  const result = teamHistory(games, filters.team, { filters, lookupGames: games });
  return {
    ok: true,
    fromSeason: filters.from,
    toSeason: filters.to,
    team: filters.team,
    filters,
    seasons,
    matchedGames: result.matchedGames,
    teams: result.teams,
    rows: result.rows,
    notes: NOTES,
    supported: {
      team: true,
      from: true,
      to: true,
      site: true,
      weather: true,
      travel: true,
      distance: true,
      roof: true,
      role: true,
      division: true,
      daysOff: true
    }
  };
}

module.exports = {
  teamHistory,
  weatherBucket,
  roofBucket,
  atsCover,
  ouResult,
  restBucket,
  afterBucket,
  parseHistoryFilters,
  matchesGlobalFilters,
  matchesTeamFilters,
  roleForTeam,
  historyPayload,
  FILTER_DEFAULTS,
  NOTES
};
