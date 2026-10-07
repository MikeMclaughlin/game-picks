'use strict';

const { roadTravel, distanceBucket, sameDivision, tzIndex } = require('./teams');
const { toNumber, scoresReady, atsLetter } = require('./grader');
const { resultLetter, formatLine } = require('./week-view');
const { timeOfDayBucket, formatKickoffEst } = require('./kickoff-slot');

const DEFAULT_FROM = 2016;
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
  daysOff: 'all',
  spread: 'all',
  total: 'all',
  timeOfDay: 'all'
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
  daysOff: 'Uses home_rest/away_rest: short ≤5 days, bye+ ≥11, else normal.',
  gameDate: 'Kickoff in America/New_York as mm/dd/yyyy hh:mm EST (literal EST suffix).',
  opponent: 'Team-relative opponent when a team is selected; otherwise the AWAY @ HOME matchup.',
  spread: 'Team-relative signed spread when a team is selected; otherwise home-favored line. Filter buckets from |spread_line|: pick = 0, small ≤3, medium ≤6.5, large 7+.',
  restDays: 'Team rest when a team is selected; otherwise away / home rest.',
  favorite: 'Straight-up wins–losses–ties when the team is a favorite (pick’em excluded).',
  dog: 'Straight-up wins–losses–ties when the team is an underdog (pick’em excluded).',
  distance: 'Timezone-based distance traveled by the road team (or the selected team).',
  cover: 'Spread cover (C), fail (F), or push (P). Team-relative when a team is selected.',
  divisional: 'Y if both clubs share the current static NFL division map.',
  total: 'Total bucket: low <42, mid 42–47.5, high ≥48.',
  timeOfDay: 'Kickoff in America/New_York: morning before 11:00, early 11:00 until 16:00, afternoon 16:00 until 19:00, primetime 19:00 and later.'
};

function spreadAbsBucket(game) {
  const s = toNumber(game.spread_line);
  if (s == null) return 'unknown';
  const abs = Math.abs(s);
  if (abs === 0) return 'pick';
  if (abs <= 3) return 'small';
  if (abs <= 6.5) return 'medium';
  return 'large';
}

function totalBucket(game) {
  const t = toNumber(game.total_line);
  if (t == null) return 'unknown';
  if (t < 42) return 'low';
  if (t < 48) return 'mid';
  return 'high';
}

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

function weatherLabel(game) {
  const roof = roofBucket(game);
  const bucket = weatherBucket(game);
  const temp = toNumber(game.temp);
  const wind = toNumber(game.wind);
  const bits = [];
  if (bucket === 'cold') bits.push('Cold');
  else if (bucket === 'windy') bits.push('Windy');
  else if (roof === 'dome') bits.push('Dome');
  else if (roof === 'retractable') bits.push(game.roof === 'open' ? 'Retractable open' : 'Retractable closed');
  else if (roof === 'outdoor') bits.push('Outdoor');
  else bits.push(game.roof || '—');
  if (roof !== 'dome' && temp != null) bits.push(`${Math.round(temp)}°F`);
  if (roof !== 'dome' && wind != null) bits.push(`${Math.round(wind)} mph`);
  return bits.join(' ').replace(/\s+/g, ' ').trim() || '—';
}

function gameDateValue(game) {
  return formatKickoffEst(game && game.kickoff) || '';
}

function signedSpreadForTeam(game, team) {
  const spread = toNumber(game.spread_line);
  if (spread == null) return null;
  const line = team === game.home_team ? -spread : spread;
  const shown = formatLine(line);
  if (shown == null) return null;
  return line > 0 ? `+${shown}` : shown;
}

function spreadLabelForRow(game, team) {
  if (team) return signedSpreadForTeam(game, team);
  const spread = toNumber(game.spread_line);
  if (spread == null) return null;
  if (spread === 0) return 'PICK';
  const fav = spread > 0 ? game.home_team : game.away_team;
  const abs = formatLine(Math.abs(spread));
  return abs == null ? null : `${fav} -${abs}`;
}

function distanceTraveled(game, team) {
  const focus = team || game.away_team;
  const isHome = Boolean(team) && game.home_team === focus && game.location !== 'Neutral';
  if (isHome) {
    return { bucket: 'home', zones: 0, dir: null, label: '0 (home)' };
  }
  const zones = Math.abs(tzIndex(game.away_team) - tzIndex(game.home_team));
  const travel = roadTravel(game.away_team, game.home_team);
  const bucket = distanceBucket(game.away_team, game.home_team);
  if (travel) {
    return { bucket: 'cross', zones: travel.zones, dir: travel.dir, label: `${travel.zones} tz ${travel.dir}` };
  }
  return { bucket, zones, dir: null, label: `${zones} tz` };
}

function restDaysForRow(game, team) {
  if (team) {
    const n = game.home_team === team ? toNumber(game.home_rest) : toNumber(game.away_rest);
    return { value: n, label: n == null ? '—' : String(n) };
  }
  const away = toNumber(game.away_rest);
  const home = toNumber(game.home_rest);
  const bits = [away == null ? '—' : String(away), home == null ? '—' : String(home)];
  return { value: away, away, home, label: bits.join(' / ') };
}

function coverForRow(game, team) {
  if (team) {
    const letter = atsLetter(game, team);
    return { letter, label: letter || '—' };
  }
  const homeLetter = atsLetter(game, game.home_team);
  if (homeLetter === 'P') return { letter: 'P', label: 'P' };
  if (homeLetter === 'C') return { letter: 'C', label: `${game.home_team} C` };
  if (homeLetter === 'F') return { letter: 'F', label: `${game.away_team} C` };
  return { letter: null, label: '—' };
}

function opponentForRow(game, team) {
  if (!team) {
    return { opponent: `${game.away_team} @ ${game.home_team}`, site: 'matchup' };
  }
  const isHome = game.home_team === team;
  const opp = isHome ? game.away_team : game.home_team;
  return { opponent: isHome ? `vs ${opp}` : `@ ${opp}`, site: isHome ? 'home' : 'road' };
}

function gameLogRow(game, team) {
  const opp = opponentForRow(game, team);
  const rest = restDaysForRow(game, team);
  const dist = distanceTraveled(game, team);
  const cover = coverForRow(game, team);
  const divisional = sameDivision(game.home_team, game.away_team);
  const spreadNum = team
    ? (toNumber(game.spread_line) == null ? null : (team === game.home_team ? -toNumber(game.spread_line) : toNumber(game.spread_line)))
    : toNumber(game.spread_line);
  return {
    game_id: game.game_id,
    season: game.season,
    week: game.week,
    gameDate: gameDateValue(game),
    kickoff: game.kickoff,
    team: team || null,
    opponent: opp.opponent,
    site: opp.site,
    spread: spreadNum,
    spreadLabel: spreadLabelForRow(game, team) || '—',
    restDays: rest.value,
    restDaysLabel: rest.label,
    weather: weatherBucket(game),
    weatherLabel: weatherLabel(game),
    distance: dist.bucket,
    distanceZones: dist.zones,
    distanceLabel: dist.label,
    cover: cover.letter,
    coverLabel: cover.label,
    roof: roofBucket(game),
    roofLabel: roofBucket(game) === 'unknown' ? (game.roof || '—') : roofBucket(game),
    divisional,
    divisionalLabel: divisional ? 'Y' : 'N'
  };
}

function gameLogRows(games, filters) {
  const team = filters.team && filters.team !== 'ALL' ? filters.team : null;
  const globalGames = games.filter((g) => matchesGlobalFilters(g, filters) && scoresReady(g));
  const rows = [];
  for (const g of globalGames) {
    if (team) {
      if (!matchesTeamFilters(g, team, filters)) continue;
      rows.push(gameLogRow(g, team));
    } else {
      if (filters.travel === 'east' || filters.travel === 'west') {
        const t = roadTravel(g.away_team, g.home_team);
        if (!t || t.dir !== filters.travel) continue;
      }
      if (filters.distance === 'local' || filters.distance === 'cross') {
        if (distanceBucket(g.away_team, g.home_team) !== filters.distance) continue;
      }
      rows.push(gameLogRow(g, null));
    }
  }
  rows.sort((a, b) => (Date.parse(b.kickoff) || 0) - (Date.parse(a.kickoff) || 0) || String(a.game_id).localeCompare(String(b.game_id)));
  return rows;
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
    }, 'all'),
    spread: alias(get('spread'), {
      all: 'all',
      pick: 'pick',
      pickem: 'pick',
      "pick'em": 'pick',
      'pick-em': 'pick',
      small: 'small',
      medium: 'medium',
      large: 'large'
    }, 'all'),
    total: alias(get('total'), {
      all: 'all',
      low: 'low',
      mid: 'mid',
      medium: 'mid',
      high: 'high'
    }, 'all'),
    timeOfDay: alias(get('timeOfDay') || get('time') || get('tod'), {
      all: 'all',
      morning: 'morning',
      early: 'early',
      afternoon: 'afternoon',
      primetime: 'primetime',
      prime: 'primetime',
      'prime-time': 'primetime',
      primetime_: 'primetime'
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
  if (filters.spread && filters.spread !== 'all' && spreadAbsBucket(game) !== filters.spread) return false;
  if (filters.total && filters.total !== 'all' && totalBucket(game) !== filters.total) return false;
  if (filters.timeOfDay && filters.timeOfDay !== 'all' && timeOfDayBucket(game) !== filters.timeOfDay) return false;
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
  const gameRows = gameLogRows(games, filters);
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
    gameRows,
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
      daysOff: true,
      gameDate: true,
      opponent: true,
      spread: true,
      restDays: true,
      cover: true,
      divisional: true,
      favorite: true,
      dog: true,
      spread: true,
      total: true,
      timeOfDay: true
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
  gameLogRows,
  gameLogRow,
  weatherLabel,
  FILTER_DEFAULTS,
  NOTES,
  spreadAbsBucket,
  totalBucket
};
