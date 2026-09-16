'use strict';

const TEAMS = {
  ARI: { abbr: 'ARI', tz: 'MT' },
  ATL: { abbr: 'ATL', tz: 'ET' },
  BAL: { abbr: 'BAL', tz: 'ET' },
  BUF: { abbr: 'BUF', tz: 'ET' },
  CAR: { abbr: 'CAR', tz: 'ET' },
  CHI: { abbr: 'CHI', tz: 'CT' },
  CIN: { abbr: 'CIN', tz: 'ET' },
  CLE: { abbr: 'CLE', tz: 'ET' },
  DAL: { abbr: 'DAL', tz: 'CT' },
  DEN: { abbr: 'DEN', tz: 'MT' },
  DET: { abbr: 'DET', tz: 'ET' },
  GB: { abbr: 'GB', tz: 'CT' },
  HOU: { abbr: 'HOU', tz: 'CT' },
  IND: { abbr: 'IND', tz: 'ET' },
  JAX: { abbr: 'JAX', tz: 'ET' },
  KC: { abbr: 'KC', tz: 'CT' },
  LA: { abbr: 'LAR', tz: 'PT' },
  LAC: { abbr: 'LAC', tz: 'PT' },
  LAR: { abbr: 'LAR', tz: 'PT' },
  LV: { abbr: 'LV', tz: 'PT' },
  MIA: { abbr: 'MIA', tz: 'ET' },
  MIN: { abbr: 'MIN', tz: 'CT' },
  NE: { abbr: 'NE', tz: 'ET' },
  NO: { abbr: 'NO', tz: 'CT' },
  NYG: { abbr: 'NYG', tz: 'ET' },
  NYJ: { abbr: 'NYJ', tz: 'ET' },
  OAK: { abbr: 'LV', tz: 'PT' },
  PHI: { abbr: 'PHI', tz: 'ET' },
  PIT: { abbr: 'PIT', tz: 'ET' },
  SD: { abbr: 'LAC', tz: 'PT' },
  SEA: { abbr: 'SEA', tz: 'PT' },
  SF: { abbr: 'SF', tz: 'PT' },
  STL: { abbr: 'LAR', tz: 'PT' },
  TB: { abbr: 'TB', tz: 'ET' },
  TEN: { abbr: 'TEN', tz: 'CT' },
  WAS: { abbr: 'WAS', tz: 'ET' },
  WSH: { abbr: 'WAS', tz: 'ET' }
};

const TZ_WEST_OF_ET = { ET: 0, CT: 1, MT: 2, PT: 3 };

function teamAbbr(code) {
  if (!code) return '';
  const t = TEAMS[String(code).toUpperCase()];
  return t ? t.abbr : String(code).toUpperCase();
}

function teamTz(code) {
  const t = TEAMS[teamAbbr(code)];
  return t ? t.tz : 'ET';
}

function tzIndex(code) {
  return TZ_WEST_OF_ET[teamTz(code)] ?? 0;
}

/**
 * Road travel across time zones. Positive zones = traveling east (west coast at east).
 * Only surface when the road team crosses more than one zone.
 */
function roadTravel(awayTeam, homeTeam) {
  const away = tzIndex(awayTeam);
  const home = tzIndex(homeTeam);
  const delta = away - home;
  if (Math.abs(delta) <= 1) return null;
  if (delta > 0) return { dir: 'east', zones: delta, label: `east +${delta}tz` };
  return { dir: 'west', zones: -delta, label: `west +${-delta}tz` };
}

function listTeamAbbrs() {
  return [...new Set(Object.values(TEAMS).map((t) => t.abbr))].sort();
}

module.exports = {
  TEAMS,
  teamAbbr,
  teamTz,
  tzIndex,
  roadTravel,
  listTeamAbbrs
};
