'use strict';

const { roadTravel, teamAbbr, teamCity } = require('./teams');
const { toNumber, scoresReady, isLocked } = require('./grader');

const SHORT_REST_DAYS = 5;

function impliedPoints(spreadLine, totalLine) {
  const spread = toNumber(spreadLine);
  const total = toNumber(totalLine);
  if (spread == null || total == null) return { home: null, away: null };
  return {
    home: (total + spread) / 2,
    away: (total - spread) / 2
  };
}

function formatLine(n) {
  if (n == null) return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatAtsPick(team, game) {
  const spread = toNumber(game.spread_line);
  if (spread == null) return team;
  const homeFavored = spread;
  const line = team === game.home_team ? -homeFavored : homeFavored;
  const shown = formatLine(line);
  if (shown == null) return team;
  const signed = line > 0 ? `+${shown}` : shown;
  return `${team} ${signed}`;
}

function resultLetter(team, game) {
  if (!scoresReady(game)) return null;
  const home = toNumber(game.home_score);
  const away = toNumber(game.away_score);
  if (home === away) return 'T';
  const winner = home > away ? game.home_team : game.away_team;
  return winner === team ? 'W' : 'L';
}

function lastGameInfo(team, prev) {
  if (!prev) return null;
  const t = teamAbbr(team);
  const letter = resultLetter(t, prev);
  if (!letter) return null;
  const opponent = prev.home_team === t ? prev.away_team : prev.home_team;
  const teamScore = prev.home_team === t ? toNumber(prev.home_score) : toNumber(prev.away_score);
  const oppScore = prev.home_team === t ? toNumber(prev.away_score) : toNumber(prev.home_score);
  const result = letter === 'W' ? 'Win' : letter === 'L' ? 'Loss' : 'Tie';
  return { letter, result, opponent, teamScore, oppScore };
}

function previousGame(history, team, beforeKickoff) {
  const t = teamAbbr(team);
  const before = Date.parse(beforeKickoff);
  let best = null;
  for (const g of history) {
    if (g.home_team !== t && g.away_team !== t) continue;
    if (!scoresReady(g)) continue;
    const k = Date.parse(g.kickoff);
    if (!Number.isFinite(k) || k >= before) continue;
    if (!best || k > Date.parse(best.kickoff)) best = g;
  }
  return best;
}

function teamGames(history, team) {
  const t = teamAbbr(team);
  return history.filter((g) => (g.home_team === t || g.away_team === t) && scoresReady(g));
}

function winPct(games, team, predicate) {
  const t = teamAbbr(team);
  let wins = 0;
  let counted = 0;
  for (const g of games) {
    if (!predicate(g, t)) continue;
    const letter = resultLetter(t, g);
    if (!letter || letter === 'T') continue;
    counted += 1;
    if (letter === 'W') wins += 1;
  }
  if (!counted) return null;
  return wins / counted;
}

function restDays(game, side) {
  return side === 'home' ? toNumber(game.home_rest) : toNumber(game.away_rest);
}

function scoringRates(history, team) {
  const games = teamGames(history, team);
  if (!games.length) return null;
  let scored = 0;
  let allowed = 0;
  for (const g of games) {
    if (g.home_team === team) {
      scored += toNumber(g.home_score);
      allowed += toNumber(g.away_score);
    } else {
      scored += toNumber(g.away_score);
      allowed += toNumber(g.home_score);
    }
  }
  return { for: scored / games.length, against: allowed / games.length, n: games.length };
}

function projectGame(game, history) {
  const home = scoringRates(history, game.home_team);
  const away = scoringRates(history, game.away_team);
  if (!home || !away) {
    const total = toNumber(game.total_line);
    return {
      hasHistory: false,
      projHome: null,
      projAway: null,
      projTotal: null,
      fadeHighTotal: total != null && total >= 46,
      ou: total != null && total >= 46 ? 'under' : total != null ? 'over' : null
    };
  }
  const projHome = (home.for + away.against) / 2;
  const projAway = (away.for + home.against) / 2;
  const projTotal = projHome + projAway;
  const projMargin = projHome - projAway;
  const total = toNumber(game.total_line);
  const spread = toNumber(game.spread_line);
  let ou = null;
  if (total != null) ou = projTotal > total ? 'over' : 'under';
  let atsTeam = null;
  if (spread != null) atsTeam = projMargin > spread ? game.home_team : game.away_team;
  return {
    hasHistory: true,
    projHome,
    projAway,
    projTotal,
    projMargin,
    fadeHighTotal: false,
    ou,
    atsTeam
  };
}

function aiPick(game, projection) {
  const total = formatLine(game.total_line);
  let ats = null;
  if (projection.atsTeam) {
    ats = formatAtsPick(projection.atsTeam, game);
  } else if (!projection.hasHistory && toNumber(game.spread_line) != null) {
    const dog = toNumber(game.spread_line) > 0 ? game.away_team : game.home_team;
    ats = formatAtsPick(dog, game);
    projection.atsTeam = dog;
  }
  let ouText = null;
  if (projection.ou && total != null) {
    ouText = `take the ${projection.ou} ${total}`;
  }
  return {
    ats,
    ou: projection.ou,
    ouText,
    label: [ats, ouText].filter(Boolean).join(' · ') || null
  };
}

function sideContext(game, side, history) {
  const team = side === 'home' ? game.home_team : game.away_team;
  const rest = restDays(game, side);
  const short = rest != null && rest <= SHORT_REST_DAYS;
  const prev = previousGame(history, team, game.kickoff);
  const last = prev ? resultLetter(team, prev) : null;
  const games = teamGames(history, team);
  const homePct = winPct(games, team, (g, t) => g.home_team === t && g.location !== 'Neutral');
  const awayPct = winPct(games, team, (g, t) => g.away_team === t);
  const shortPct = winPct(games, team, (g, t) => {
    const d = g.home_team === t ? toNumber(g.home_rest) : toNumber(g.away_rest);
    return d != null && d <= SHORT_REST_DAYS;
  });
  const ctx = {
    team,
    city: teamCity(team),
    side,
    rest,
    short,
    last,
    lastGame: lastGameInfo(team, prev),
    homeWinPct: homePct,
    awayWinPct: awayPct,
    shortRestWinPct: short ? shortPct : null
  };
  if (side === 'away') {
    const travel = roadTravel(game.away_team, game.home_team);
    if (travel) {
      const travelPct = winPct(games, team, (g, t) => {
        if (g.away_team !== t) return false;
        const tr = roadTravel(g.away_team, g.home_team);
        return tr && tr.dir === travel.dir && tr.zones === travel.zones;
      });
      ctx.travel = { ...travel, winPct: travelPct };
    }
  }
  return ctx;
}

function enrichGame(game, history, wagersByGame = {}) {
  const projection = projectGame(game, history);
  const pick = aiPick(game, projection);
  const implied = impliedPoints(game.spread_line, game.total_line);
  const locked = isLocked(game);
  const userWagers = wagersByGame[game.game_id] || [];
  return {
    game_id: game.game_id,
    season: game.season,
    week: game.week,
    game_type: game.game_type,
    kickoff: game.kickoff,
    weekday: game.weekday,
    home_team: game.home_team,
    away_team: game.away_team,
    home_score: game.home_score,
    away_score: game.away_score,
    spread_line: toNumber(game.spread_line),
    total_line: toNumber(game.total_line),
    implied,
    xPts: {
      away: implied.away,
      home: implied.home
    },
    locked,
    fadeTotal: Boolean(projection.fadeHighTotal),
    projectedOver: projection.ou === 'over',
    projectedUnder: projection.ou === 'under',
    homeUnderdog: toNumber(game.spread_line) != null && toNumber(game.spread_line) < 0,
    aiPick: pick,
    home: sideContext(game, 'home', history),
    away: sideContext(game, 'away', history),
    wagers: userWagers
  };
}

function currentSeasonWeek(games, now = new Date()) {
  const ts = now.getTime();
  const sorted = [...games].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  if (!sorted.length) {
    return { season: now.getUTCFullYear(), week: 1 };
  }
  const upcoming = sorted.find((g) => Date.parse(g.kickoff) > ts - 3 * 60 * 60 * 1000);
  const target = upcoming || sorted[sorted.length - 1];
  return { season: target.season, week: target.week };
}

function pctLabel(value) {
  if (value == null) return null;
  return `${Math.round(value * 100)}%`;
}

module.exports = {
  SHORT_REST_DAYS,
  impliedPoints,
  formatLine,
  formatAtsPick,
  resultLetter,
  scoringRates,
  projectGame,
  aiPick,
  enrichGame,
  currentSeasonWeek,
  pctLabel,
  winPct,
  previousGame,
  lastGameInfo
};
