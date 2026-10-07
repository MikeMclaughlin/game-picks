'use strict';

const { roadTravel, distanceBucket, sameDivision } = require('./teams');
const { toNumber, scoresReady, atsLetter } = require('./grader');
const { resultLetter, projectGame, projectGameFromRates, aiPick } = require('./week-view');
const {
  fitCalibrationFromGames,
  sliceBrierStats,
  bumpScoringRates,
  CALIBRATION_NOTE,
  CALIBRATION_TARGET
} = require('./calibration');
const { formatKickoffEst } = require('./kickoff-slot');
const {
  parseHistoryFilters,
  matchesGlobalFilters,
  matchesTeamFilters,
  roleForTeam,
  restBucket,
  weatherBucket,
  roofBucket,
  weatherLabel,
  gameLogRow,
  FILTER_DEFAULTS,
  NOTES,
  spreadAbsBucket,
  totalBucket
} = require('./history');
const { timeOfDayBucket } = require('./kickoff-slot');
const { starterOutState } = require('./nflverse-injuries');

const SMALL_N = 30;
const CSV_GAME_CAP = 8000;

const EXTRA_DEFAULTS = {
  spread: 'all',
  total: 'all',
  timeOfDay: 'all',
  starterOut: 'all'
};

const CHAIN_DIMS = [
  { dim: 'lastGame', label: 'Last game W/L', values: ['W', 'L', 'T'] },
  { dim: 'last5wl', label: 'Last-5 W/L', values: ['hot', 'mixed', 'cold'] },
  { dim: 'last5ats', label: 'Last-5 ATS', values: ['hot', 'mixed', 'cold'] },
  { dim: 'rest', label: 'Rest', values: ['short', 'normal', 'bye'] },
  { dim: 'site', label: 'Home/away', values: ['home', 'road'] },
  { dim: 'division', label: 'Divisional', values: ['divisional', 'non-div'] },
  { dim: 'role', label: 'Dog/fav', values: ['favorite', 'underdog'] },
  { dim: 'spread', label: 'Spread size', values: ['pick', 'small', 'medium', 'large'] },
  { dim: 'total', label: 'Total bucket', values: ['low', 'mid', 'high'] },
  { dim: 'weather', label: 'Weather', values: ['cold', 'windy', 'fair', 'dome'] },
  { dim: 'roof', label: 'Roof', values: ['dome', 'outdoor', 'retractable'] },
  { dim: 'travel', label: 'Travel', values: ['east', 'west'] },
  { dim: 'distance', label: 'Distance', values: ['local', 'cross'] },
  { dim: 'timeOfDay', label: 'Time of day', values: ['morning', 'early', 'afternoon', 'primetime'] },
  { dim: 'starterOut', label: 'Starter out', values: ['out', 'active'] }
];

const DIM_SET = new Set(CHAIN_DIMS.map((d) => d.dim));

const VALUE_ALIASES = {
  lastGame: { w: 'W', win: 'W', l: 'L', loss: 'L', t: 'T', tie: 'T' },
  last5wl: { hot: 'hot', mixed: 'mixed', cold: 'cold' },
  last5ats: { hot: 'hot', mixed: 'mixed', cold: 'cold' },
  rest: { short: 'short', normal: 'normal', bye: 'bye', 'bye+': 'bye' },
  site: { home: 'home', road: 'road', away: 'road' },
  division: { divisional: 'divisional', div: 'divisional', 'non-div': 'non-div', nondiv: 'non-div' },
  role: { favorite: 'favorite', fav: 'favorite', underdog: 'underdog', dog: 'underdog' },
  spread: { pick: 'pick', pickem: 'pick', small: 'small', medium: 'medium', large: 'large' },
  total: { low: 'low', mid: 'mid', medium: 'mid', high: 'high' },
  weather: { cold: 'cold', windy: 'windy', fair: 'fair', dome: 'dome' },
  roof: { dome: 'dome', outdoor: 'outdoor', outdoors: 'outdoor', retractable: 'retractable' },
  travel: { east: 'east', west: 'west' },
  distance: { local: 'local', cross: 'cross', 'cross-country': 'cross' },
  timeOfDay: {
    morning: 'morning',
    early: 'early',
    afternoon: 'afternoon',
    primetime: 'primetime',
    prime: 'primetime',
    'prime-time': 'primetime'
  },
  starterOut: {
    out: 'out',
    active: 'active',
    in: 'active',
    clear: 'active',
    none: 'active',
    yes: 'out',
    'starter-out': 'out',
    starterout: 'out'
  }
};

function aliasValue(dim, raw) {
  if (raw == null || raw === '') return null;
  const key = String(raw).trim();
  if (!key || key.toLowerCase() === 'all' || key === '*') return null;
  const map = VALUE_ALIASES[dim];
  if (!map) return key;
  const aliased = map[key.toLowerCase()];
  if (aliased) return aliased;
  if (dim === 'lastGame') {
    const u = key.toUpperCase();
    if (u === 'W' || u === 'L' || u === 'T') return u;
  }
  return key;
}

function parseBacktestFilters(searchParams, extras = {}) {
  const base = parseHistoryFilters(searchParams, extras);
  const get = (name) => {
    if (searchParams && typeof searchParams.get === 'function') return searchParams.get(name);
    if (searchParams && searchParams[name] != null) return searchParams[name];
    return extras[name] != null ? extras[name] : null;
  };
  return {
    ...base,
    spread: aliasValue('spread', get('spread')) || EXTRA_DEFAULTS.spread,
    total: aliasValue('total', get('total')) || EXTRA_DEFAULTS.total,
    starterOut: acceptedStarterOut(get('starterOut') || get('starter_out'))
  };
}

function acceptedStarterOut(raw) {
  const aliased = aliasValue('starterOut', raw);
  if (aliased === 'out' || aliased === 'active') return aliased;
  return EXTRA_DEFAULTS.starterOut;
}

function parseChain(input) {
  if (!input) return [];
  let parts = [];
  if (Array.isArray(input)) {
    parts = input;
  } else if (typeof input === 'string') {
    parts = input.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  } else if (typeof input === 'object') {
    if (Array.isArray(input.chain)) return parseChain(input.chain);
    parts = [input];
  }
  const steps = [];
  for (const part of parts) {
    let dim;
    let value;
    if (part && typeof part === 'object') {
      dim = part.dim || part.key || part.dimension;
      value = part.value;
    } else {
      const raw = String(part);
      const idx = raw.indexOf(':');
      if (idx < 0) continue;
      dim = raw.slice(0, idx).trim();
      value = raw.slice(idx + 1).trim();
    }
    dim = String(dim || '').trim();
    if (dim === 'daysOff') dim = 'rest';
    if (dim === 'last5' || dim === 'lastFive') dim = 'last5wl';
    if (!DIM_SET.has(dim)) continue;
    const normalized = aliasValue(dim, value);
    if (!normalized) continue;
    if (dim === 'starterOut' && normalized !== 'out' && normalized !== 'active') continue;
    steps.push({ dim, value: normalized });
  }
  return steps;
}

function streakBucket(pattern) {
  if (!pattern) return 'none';
  const parts = String(pattern).split('-').filter(Boolean);
  if (parts.length < 3) return 'short';
  const good = parts.filter((p) => p === 'W' || p === 'C').length;
  if (good >= 4) return 'hot';
  if (good <= 1) return 'cold';
  return 'mixed';
}

function siteFor(game, team) {
  if (game.away_team === team) return 'road';
  if (game.home_team === team && game.location !== 'Neutral') return 'home';
  if (game.home_team === team) return 'neutral';
  return null;
}

function weatherState(game) {
  const bucket = weatherBucket(game);
  if (bucket === 'outdoors') return 'fair';
  return bucket;
}

function indexByTeam(games) {
  const map = new Map();
  for (const g of games) {
    if (!scoresReady(g)) continue;
    for (const t of [g.home_team, g.away_team]) {
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(g);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  }
  return map;
}

function priorGames(index, team, kickoff) {
  const all = index.get(team) || [];
  const before = Date.parse(kickoff);
  if (!Number.isFinite(before)) return [];
  const out = [];
  for (const g of all) {
    const k = Date.parse(g.kickoff);
    if (Number.isFinite(k) && k < before) out.push(g);
  }
  return out;
}

function lastFiveFromPrior(prior, team, letterFn) {
  const letters = [];
  for (let i = prior.length - 1; i >= 0 && letters.length < 5; i -= 1) {
    const letter = letterFn(prior[i], team);
    if (!letter || letter === 'T' || letter === 'P') continue;
    letters.push(letter);
  }
  if (!letters.length) return null;
  return letters.reverse().join('-');
}

function stateValue(game, team, dim, index, injuryIndex) {
  const prior = (dim === 'lastGame' || dim === 'last5wl' || dim === 'last5ats')
    ? priorGames(index, team, game.kickoff)
    : null;
  if (dim === 'lastGame') {
    if (!prior.length) return 'none';
    return resultLetter(team, prior[prior.length - 1]) || 'none';
  }
  if (dim === 'last5wl') {
    return streakBucket(lastFiveFromPrior(prior, team, (g, t) => resultLetter(t, g)));
  }
  if (dim === 'last5ats') {
    return streakBucket(lastFiveFromPrior(prior, team, (g, t) => atsLetter(g, t)));
  }
  if (dim === 'rest') {
    const d = game.home_team === team ? toNumber(game.home_rest) : toNumber(game.away_rest);
    return restBucket(d);
  }
  if (dim === 'site') return siteFor(game, team);
  if (dim === 'division') return sameDivision(game.home_team, game.away_team) ? 'divisional' : 'non-div';
  if (dim === 'role') return roleForTeam(game, team);
  if (dim === 'spread') return spreadAbsBucket(game);
  if (dim === 'total') return totalBucket(game);
  if (dim === 'weather') return weatherState(game);
  if (dim === 'roof') return roofBucket(game);
  if (dim === 'travel') {
    if (game.away_team !== team) return 'none';
    const t = roadTravel(game.away_team, game.home_team);
    return t ? t.dir : 'none';
  }
  if (dim === 'distance') {
    if (game.home_team === team && game.location !== 'Neutral') return 'home';
    return distanceBucket(game.away_team, game.home_team);
  }
  if (dim === 'timeOfDay') return timeOfDayBucket(game);
  if (dim === 'starterOut') return starterOutState(game, team, injuryIndex);
  return null;
}

function matchesExtraFilters(game, filters) {
  if (filters.spread && filters.spread !== 'all' && spreadAbsBucket(game) !== filters.spread) return false;
  if (filters.total && filters.total !== 'all' && totalBucket(game) !== filters.total) return false;
  return true;
}

function hasTeamRelativeConstraint(filters, chain) {
  const teamKeys = ['site', 'travel', 'distance', 'role', 'daysOff', 'starterOut'];
  for (const key of teamKeys) {
    if (filters[key] && filters[key] !== 'all') return true;
  }
  if (chain && chain.length) return true;
  return false;
}

function focusTeams(game, filters, chain) {
  if (filters.team && filters.team !== 'ALL') {
    if (game.home_team === filters.team || game.away_team === filters.team) return [filters.team];
    return [];
  }
  if (hasTeamRelativeConstraint(filters, chain)) {
    return [game.away_team, game.home_team];
  }
  return [game.home_team];
}

function record(wins, losses, pushes = 0) {
  const played = wins + losses;
  return {
    wins,
    losses,
    pushes,
    n: wins + losses + pushes,
    decided: played,
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
    if (o === 'W' || o === 'O' || o === 'C') w += 1;
    else if (o === 'L' || o === 'U' || o === 'F') l += 1;
    else if (o === 'P' || o === 'T') p += 1;
  }
  return record(w, l, p);
}

function ouResult(game) {
  if (!scoresReady(game) || toNumber(game.total_line) == null) return null;
  const total = toNumber(game.home_score) + toNumber(game.away_score);
  const line = toNumber(game.total_line);
  if (total === line) return 'P';
  return total > line ? 'O' : 'U';
}

function atsCoverLetter(game, team) {
  const letter = atsLetter(game, team);
  if (letter === 'C') return 'W';
  if (letter === 'F') return 'L';
  return letter;
}

function liftPts(slicePct, basePct) {
  if (slicePct == null || basePct == null) return null;
  return slicePct - basePct;
}

function liftRel(slicePct, basePct) {
  if (slicePct == null || basePct == null || basePct === 0) return null;
  return (slicePct - basePct) / basePct;
}

function uniqueGames(obs) {
  const ids = new Set();
  for (const o of obs) ids.add(o.game.game_id);
  return ids.size;
}

function summarize(obs) {
  const uniqueOu = [];
  const seenOu = new Set();
  for (const o of obs) {
    if (seenOu.has(o.game.game_id)) continue;
    seenOu.add(o.game.game_id);
    uniqueOu.push(o.game);
  }
  const outright = tally(obs, (o) => resultLetter(o.team, o.game));
  const ats = tally(obs, (o) => atsCoverLetter(o.game, o.team));
  const ou = tally(uniqueOu, ouResult);
  return {
    n: obs.length,
    uniqueGames: uniqueOu.length,
    smallN: obs.length < SMALL_N,
    outright,
    ats,
    ou
  };
}

function gradeExpected(game, pick) {
  let atsHit = null;
  if (pick && pick.atsTeam) {
    const letter = atsLetter(game, pick.atsTeam);
    if (letter === 'P') atsHit = 'P';
    else if (letter === 'C') atsHit = 'W';
    else if (letter === 'F') atsHit = 'L';
  }
  let ouHit = null;
  if (pick && pick.ou) {
    const r = ouResult(game);
    if (r === 'P') ouHit = 'P';
    else if ((r === 'O' && pick.ou === 'over') || (r === 'U' && pick.ou === 'under')) ouHit = 'W';
    else if (r) ouHit = 'L';
  }
  let joint = null;
  if (atsHit && ouHit) {
    if (atsHit === 'L' || ouHit === 'L') joint = 'L';
    else if (atsHit === 'W' && ouHit === 'W') joint = 'W';
    else joint = 'P';
  }
  return { atsHit, ouHit, joint };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  'date',
  'season',
  'week',
  'away',
  'home',
  'focus',
  'spread',
  'total',
  'away_rest',
  'home_rest',
  'weather',
  'roof',
  'site',
  'division',
  'role',
  'last_game',
  'last5_wl',
  'last5_ats',
  'home_score',
  'away_score',
  'outright',
  'cover',
  'ou',
  'expected',
  'confidence',
  'ou_confidence',
  'expected_ats_hit',
  'expected_ou_hit',
  'starter_out'
];

function toCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    const rec = {
      date: row.gameDate,
      season: row.season,
      week: row.week,
      away: row.away_team,
      home: row.home_team,
      focus: row.team,
      spread: row.spreadLabel,
      total: row.total_line,
      away_rest: row.away_rest,
      home_rest: row.home_rest,
      weather: row.weatherLabel,
      roof: row.roofLabel,
      site: row.site,
      division: row.divisionalLabel,
      role: row.role,
      last_game: row.lastGame,
      last5_wl: row.last5wl,
      last5_ats: row.last5ats,
      home_score: row.home_score,
      away_score: row.away_score,
      outright: row.outright,
      cover: row.coverLabel,
      ou: row.ou,
      expected: row.expected,
      confidence: row.confidence,
      ou_confidence: row.ouConfidence,
      expected_ats_hit: row.expectedAtsHit,
      expected_ou_hit: row.expectedOuHit,
      starter_out: row.starterOut
    };
    lines.push(CSV_HEADERS.map((h) => csvEscape(rec[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function enrichObservation(obs, index, injuryIndex) {
  const { game, team, pick, expectedGrade } = obs;
  const log = gameLogRow(game, team);
  const restDays = game.home_team === team ? toNumber(game.home_rest) : toNumber(game.away_rest);
  const prior = priorGames(index, team, game.kickoff);
  const last = prior.length ? (resultLetter(team, prior[prior.length - 1]) || 'none') : 'none';
  return {
    game_id: game.game_id,
    season: game.season,
    week: game.week,
    gameDate: formatKickoffEst(game.kickoff) || log.gameDate,
    kickoff: game.kickoff,
    away_team: game.away_team,
    home_team: game.home_team,
    team,
    matchup: `${game.away_team} @ ${game.home_team}`,
    opponent: `${game.away_team} @ ${game.home_team}`,
    site: log.site,
    spread: log.spread,
    spreadLabel: log.spreadLabel,
    total_line: toNumber(game.total_line),
    away_rest: toNumber(game.away_rest),
    home_rest: toNumber(game.home_rest),
    restDays,
    restBucket: restBucket(restDays),
    travel: stateValue(game, team, 'travel', index, injuryIndex),
    starterOut: starterOutState(game, team, injuryIndex),
    timeOfDay: timeOfDayBucket(game),
    spreadBucket: spreadAbsBucket(game),
    totalBucket: totalBucket(game),
    weatherLabel: log.weatherLabel,
    roofLabel: log.roofLabel,
    distanceLabel: log.distanceLabel,
    cover: log.cover,
    coverLabel: log.coverLabel,
    divisional: log.divisional,
    divisionalLabel: log.divisionalLabel,
    role: roleForTeam(game, team),
    lastGame: last,
    last5wl: lastFiveFromPrior(prior, team, (g, t) => resultLetter(t, g)),
    last5ats: lastFiveFromPrior(prior, team, (g, t) => atsLetter(g, t)),
    home_score: toNumber(game.home_score),
    away_score: toNumber(game.away_score),
    outright: resultLetter(team, game),
    ou: ouResult(game),
    expected: pick && pick.expected ? pick.expected : null,
    expectedAts: pick && pick.ats ? pick.ats : null,
    expectedOu: pick && pick.ou ? pick.ou : null,
    confidence: pick && pick.atsConfidence != null ? pick.atsConfidence : (pick && pick.confidence != null ? pick.confidence : null),
    ouConfidence: pick && pick.ouConfidence != null ? pick.ouConfidence : null,
    rawConfidence: pick && pick.rawConfidence != null ? pick.rawConfidence : null,
    rawOuConfidence: pick && pick.rawOuConfidence != null ? pick.rawOuConfidence : null,
    expectedAtsHit: expectedGrade ? expectedGrade.atsHit : null,
    expectedOuHit: expectedGrade ? expectedGrade.ouHit : null,
    expectedJoint: expectedGrade ? expectedGrade.joint : null
  };
}

function collectObservations(games, filters, chain, index, injuryIndex) {
  const out = [];
  for (const game of games) {
    if (!scoresReady(game)) continue;
    if (!matchesGlobalFilters(game, filters)) continue;
    if (!matchesExtraFilters(game, filters)) continue;
    const teams = focusTeams(game, filters, chain);
    for (const team of teams) {
      if (!matchesTeamFilters(game, team, filters)) continue;
      if (!matchesStarterOut(game, team, filters, injuryIndex)) continue;
      let ok = true;
      for (const step of chain) {
        if (stateValue(game, team, step.dim, index, injuryIndex) !== step.value) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      out.push({ game, team });
    }
  }
  return out;
}

function matchesStarterOut(game, team, filters, injuryIndex) {
  const want = filters && filters.starterOut;
  if (!want || want === 'all') return true;
  return starterOutState(game, team, injuryIndex) === want;
}

function wantsInjurySlice(filters, chain) {
  if (filters && filters.starterOut && filters.starterOut !== 'all') return true;
  return (chain || []).some((step) => step && step.dim === 'starterOut');
}

function yearOnlyFilters(filters) {
  return {
    ...FILTER_DEFAULTS,
    ...EXTRA_DEFAULTS,
    from: filters.from,
    to: filters.to,
    team: 'ALL'
  };
}

function teamYearFilters(filters) {
  return {
    ...FILTER_DEFAULTS,
    ...EXTRA_DEFAULTS,
    from: filters.from,
    to: filters.to,
    team: filters.team
  };
}

function expectedPicksByGame(games) {
  const sorted = [...games]
    .filter((g) => scoresReady(g) && g.game_type !== 'PRE')
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || String(a.game_id).localeCompare(String(b.game_id)));
  const rates = new Map();
  const out = new Map();
  for (const game of sorted) {
    const projection = projectGameFromRates(game, rates.get(game.home_team), rates.get(game.away_team));
    out.set(game.game_id, aiPick(game, projection));
    bumpScoringRates(rates, game);
  }
  return out;
}

function attachExpected(obs, games) {
  if (!obs.length) return obs;
  const picks = expectedPicksByGame(games);
  for (const o of obs) {
    const pick = picks.get(o.game.game_id) || aiPick(o.game, projectGame(o.game, []));
    o.pick = pick;
    o.expectedGrade = gradeExpected(o.game, pick);
  }
  return obs;
}

function expectedSummary(obs) {
  const ats = tally(obs, (o) => o.expectedGrade && o.expectedGrade.atsHit);
  const ou = tally(obs, (o) => o.expectedGrade && o.expectedGrade.ouHit);
  const joint = tally(obs, (o) => o.expectedGrade && o.expectedGrade.joint);
  let confSum = 0;
  let confN = 0;
  let ouSum = 0;
  let ouN = 0;
  for (const o of obs) {
    const atsConf = o.pick && (o.pick.atsConfidence != null ? o.pick.atsConfidence : o.pick.confidence);
    if (atsConf != null) {
      confSum += atsConf;
      confN += 1;
    }
    if (o.pick && o.pick.ouConfidence != null) {
      ouSum += o.pick.ouConfidence;
      ouN += 1;
    }
  }
  const brier = sliceBrierStats(obs);
  return {
    ats,
    ou,
    joint,
    confidenceAvg: confN ? Math.round(confSum / confN) : null,
    ouConfidenceAvg: ouN ? Math.round(ouSum / ouN) : null,
    calibrationTarget: CALIBRATION_TARGET,
    brierRaw: brier.brierRaw,
    brierCalibrated: brier.brierCalibrated,
    brierN: brier.n
  };
}

function chainPath(games, filters, chain, index, injuryIndex) {
  const path = [];
  const yearFilters = yearOnlyFilters(filters);
  const yearObs = collectObservations(games, yearFilters, [], index, injuryIndex);
  path.push({
    step: 0,
    label: 'League (year range)',
    dim: null,
    value: null,
    n: yearObs.length,
    uniqueGames: uniqueGames(yearObs),
    stats: summarize(yearObs)
  });
  const sliceObs = collectObservations(games, filters, [], index, injuryIndex);
  path.push({
    step: 1,
    label: 'Filtered slice',
    dim: 'filters',
    value: null,
    n: sliceObs.length,
    uniqueGames: uniqueGames(sliceObs),
    stats: summarize(sliceObs)
  });
  let applied = [];
  for (let i = 0; i < chain.length; i += 1) {
    applied = applied.concat(chain[i]);
    const matched = collectObservations(games, filters, applied, index, injuryIndex);
    path.push({
      step: i + 2,
      label: `${chain[i].dim}:${chain[i].value}`,
      dim: chain[i].dim,
      value: chain[i].value,
      n: matched.length,
      uniqueGames: uniqueGames(matched),
      stats: summarize(matched)
    });
  }
  return path;
}

function compareBlock(slice, baseline) {
  return {
    outright: {
      slice: slice.outright,
      baseline: baseline.outright,
      liftPts: liftPts(slice.outright.pct, baseline.outright.pct),
      liftRel: liftRel(slice.outright.pct, baseline.outright.pct)
    },
    ats: {
      slice: slice.ats,
      baseline: baseline.ats,
      liftPts: liftPts(slice.ats.pct, baseline.ats.pct),
      liftRel: liftRel(slice.ats.pct, baseline.ats.pct)
    },
    ou: {
      slice: slice.ou,
      baseline: baseline.ou,
      liftPts: liftPts(slice.ou.pct, baseline.ou.pct),
      liftRel: liftRel(slice.ou.pct, baseline.ou.pct)
    }
  };
}

function backtestPayload(games, options = {}) {
  const filters = {
    ...FILTER_DEFAULTS,
    ...EXTRA_DEFAULTS,
    ...(options.filters || {})
  };
  const chain = parseChain(options.chain || []);
  const injuryIndex = options.injuryIndex || null;
  const scored = (games || []).filter((g) => g.game_type !== 'PRE');
  fitCalibrationFromGames(scored);
  const index = indexByTeam(scored);
  const leagueObs = collectObservations(scored, yearOnlyFilters(filters), [], index, injuryIndex);
  const peerObs = collectObservations(scored, teamYearFilters(filters), [], index, injuryIndex);
  const matched = collectObservations(scored, filters, chain, index, injuryIndex);
  attachExpected(matched, scored);
  const slice = summarize(matched);
  const league = summarize(leagueObs);
  const peer = summarize(peerObs);
  const expected = expectedSummary(matched);
  const rows = matched
    .map((o) => enrichObservation(o, index, injuryIndex))
    .sort((a, b) => (Date.parse(b.kickoff) || 0) - (Date.parse(a.kickoff) || 0) || String(a.game_id).localeCompare(String(b.game_id)));
  const seasons = [...new Set(scored.map((g) => Number(g.season)).filter(Number.isFinite))].sort((a, b) => a - b);
  return {
    ok: true,
    smallNThreshold: SMALL_N,
    filters,
    chain,
    seasons,
    n: slice.n,
    uniqueGames: slice.uniqueGames,
    smallN: slice.smallN,
    slice,
    league,
    peer,
    vsLeague: compareBlock(slice, league),
    vsPeer: compareBlock(slice, peer),
    expected,
    path: chainPath(scored, filters, chain, index, injuryIndex),
    games: rows.slice(0, CSV_GAME_CAP),
    truncated: rows.length > CSV_GAME_CAP,
    notes: {
      ...NOTES,
      smallN: `Rates with N < ${SMALL_N} are greyed — treat them as noisy.`,
      confidence: CALIBRATION_NOTE,
      expected: 'Expected call uses the same projection as Current Week AI Pick (recent form, site, rest, travel, and home field — not career scoring rate alone). ATS confidence and O/U confidence are separate. A passed ATS side is not graded as a cover.',
      baseline: 'League baseline is all scored games in the selected year range (home perspective when no team is selected). Team baseline is that club’s unfiltered games in the same years.',
      chain: 'Each chain step further restricts games whose pre-game state matches that dimension (last-5 hot = 4–5 W or covers).',
      last5: 'hot = 4–5 wins/covers in the last 5 decided games; cold = 0–1; mixed = 2–3. Patterns shorter than 3 decided games are excluded from those buckets.',
      spread: 'Spread size from |spread_line|: pick = 0, small ≤3, medium ≤6.5, large 7+.',
      total: 'Total bucket: low <42, mid 42–47.5, high ≥48.',
      timeOfDay: NOTES.timeOfDay,
      starterOut: 'Starter out uses the nflverse-data injuries release (official weekly report_status). Out means a quarterback is listed Out for that team, season, week, and game type. Active means that season’s file is loaded and no QB is Out. A season that is not loaded is n/a and matches neither Out nor Active.',
      opponent: 'Away and home team abbreviations as AWAY @ HOME.',
      restDays: 'Days of rest for the focus team before this game.'
    },
    dims: CHAIN_DIMS
  };
}

function backtestCsv(payload) {
  return toCsv((payload && payload.games) || []);
}

module.exports = {
  SMALL_N,
  CHAIN_DIMS,
  parseBacktestFilters,
  parseChain,
  spreadAbsBucket,
  totalBucket,
  streakBucket,
  backtestPayload,
  backtestCsv,
  toCsv,
  collectObservations,
  expectedCallAccuracy: expectedSummary,
  wantsInjurySlice,
  EXTRA_DEFAULTS
};
