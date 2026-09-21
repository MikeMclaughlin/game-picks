'use strict';

const { roadTravel, teamAbbr, teamCity } = require('./teams');
const { toNumber, scoresReady, isLocked, atsLetter } = require('./grader');
const { kickoffSlot } = require('./kickoff-slot');

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

function roundedTenths(n) {
  return Math.round(Number(n) * 10) / 10;
}

function resolveOpening(existingOpen, incomingCurrent) {
  const stored = toNumber(existingOpen);
  if (stored != null) return stored;
  return toNumber(incomingCurrent);
}

function formatSpreadFavorite(line, home, away) {
  const n = toNumber(line);
  if (n == null) return null;
  if (n === 0) return 'PICK';
  const fav = n > 0 ? home : away;
  const abs = formatLine(Math.abs(n));
  return `${fav} -${abs}`;
}

function sinceOpenLabel(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return null;
  let ms = now.getTime() - then.getTime();
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return days === 1 ? 'since 1 day ago' : `since ${days} days ago`;
  if (hours >= 1) return hours === 1 ? 'since 1 hour ago' : `since ${hours} hours ago`;
  if (minutes >= 1) return minutes === 1 ? 'since 1 minute ago' : `since ${minutes} minutes ago`;
  return 'since just now';
}

function spreadMovement(game, now = new Date()) {
  const current = toNumber(game.spread_line);
  const open = toNumber(game.spread_open != null ? game.spread_open : game.spread_line);
  if (current == null && open == null) return null;
  const line = current != null ? current : open;
  const delta = open == null || current == null ? 0 : roundedTenths(current - open);
  const moved = open != null && current != null && delta !== 0;
  const toward = !moved ? null : (delta > 0 ? game.home_team : game.away_team);
  const openFav = open > 0 ? game.home_team : open < 0 ? game.away_team : null;
  const towardFav = Boolean(moved && openFav && toward === openFav);
  const tone = !moved ? 'flat' : (towardFav ? 'down' : 'up');
  return {
    open,
    current: line,
    delta,
    moved,
    toward,
    openLabel: formatSpreadFavorite(open, game.home_team, game.away_team),
    deltaLabel: moved ? `▲ ${Math.abs(delta).toFixed(1)} toward ${toward}` : 'flat',
    tone,
    since: game.spread_open_at || null,
    sinceLabel: moved ? sinceOpenLabel(game.spread_open_at, now) : null
  };
}

function totalMovement(game, now = new Date()) {
  const current = toNumber(game.total_line);
  const open = toNumber(game.total_open != null ? game.total_open : game.total_line);
  if (current == null && open == null) return null;
  const line = current != null ? current : open;
  const delta = open == null || current == null ? 0 : roundedTenths(current - open);
  const moved = open != null && current != null && delta !== 0;
  const toward = !moved ? null : (delta > 0 ? 'Over' : 'Under');
  const arrow = delta > 0 ? '▲' : '▼';
  const tone = !moved ? 'flat' : (delta > 0 ? 'down' : 'up');
  return {
    open,
    current: line,
    delta,
    moved,
    toward,
    openLabel: formatLine(open),
    deltaLabel: moved ? `${arrow} ${Math.abs(delta).toFixed(1)} toward ${toward}` : 'flat',
    tone,
    since: game.total_open_at || null,
    sinceLabel: moved ? sinceOpenLabel(game.total_open_at, now) : null
  };
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
  const margin = teamScore != null && oppScore != null ? Math.abs(teamScore - oppScore) : null;
  const signed = letter === 'W' && margin != null
    ? `+${margin}`
    : (letter === 'L' && margin != null ? `-${margin}` : null);
  const label = letter === 'T' || margin == null || !signed
    ? result
    : (letter === 'W' ? `WIN ${signed}` : `Loss ${signed}`);
  return { letter, result, opponent, teamScore, oppScore, margin, signed, label };
}

function showRestDays(rest) {
  const n = toNumber(rest);
  return n != null && n !== 7;
}

function showRestWinPct(rest) {
  const n = toNumber(rest);
  return n != null && n !== 7 && n !== 8;
}

function restAmountWinPct(games, team, rest) {
  const n = toNumber(rest);
  if (!showRestWinPct(n)) return null;
  return winPct(games, team, (g, t) => {
    const d = g.home_team === t ? toNumber(g.home_rest) : toNumber(g.away_rest);
    return d != null && d === n;
  });
}

function priorScoredGames(history, team, beforeKickoff) {
  const t = teamAbbr(team);
  const before = Date.parse(beforeKickoff);
  return (history || [])
    .filter((g) => (g.home_team === t || g.away_team === t) && scoresReady(g))
    .filter((g) => {
      const k = Date.parse(g.kickoff);
      return Number.isFinite(k) && Number.isFinite(before) && k < before;
    })
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

function lastFiveLetters(history, team, beforeKickoff, letterFn) {
  const letters = [];
  const games = priorScoredGames(history, team, beforeKickoff);
  for (let i = games.length - 1; i >= 0 && letters.length < 5; i -= 1) {
    const letter = letterFn(games[i], teamAbbr(team));
    if (!letter || letter === 'T' || letter === 'P') continue;
    letters.push(letter);
  }
  if (!letters.length) return null;
  return letters.reverse().join('-');
}

function lastFiveOutright(history, team, beforeKickoff) {
  return lastFiveLetters(history, team, beforeKickoff, (g, t) => resultLetter(t, g));
}

function lastFiveAts(history, team, beforeKickoff) {
  return lastFiveLetters(history, team, beforeKickoff, (g, t) => atsLetter(g, t));
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

function isPreseason(game) {
  return String(game && game.game_type ? game.game_type : 'REG').toUpperCase() === 'PRE';
}

function formatRecord(wins, losses, ties) {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

/** YTD W-L from scored regular-season games this season before kickoff. Ties omitted from win %. */
function seasonRecord(history, team, season, beforeKickoff) {
  const t = teamAbbr(team);
  const cap = Number(season);
  const games = priorScoredGames(history, team, beforeKickoff).filter((g) => {
    if (isPreseason(g)) return false;
    const s = Number(g.season);
    if (!Number.isFinite(s) || !Number.isFinite(cap)) return false;
    return s === cap;
  });
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const g of games) {
    const letter = resultLetter(t, g);
    if (letter === 'W') wins += 1;
    else if (letter === 'L') losses += 1;
    else if (letter === 'T') ties += 1;
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    ties,
    games: games.length,
    label: formatRecord(wins, losses, ties),
    winPct: decided ? wins / decided : null
  };
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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function expectedCallLabel(ats, ou) {
  const ouWord = ou === 'over' ? 'Over' : ou === 'under' ? 'Under' : null;
  if (ats && ouWord) return `${ats} and ${ouWord}`;
  return ats || ouWord || null;
}

/**
 * Confidence 51–92 from projection edges and sample size (not a model probability).
 * Base 52. ATS: +3.5 per |projMargin − spread| (cap +21). OU: +2 per |projTotal − total|
 * (cap +14). Sample n = min(home games, away games): <8 −10, <16 −5, <30 −2, ≥60 +4.
 * No-history heuristic (fade totals ≥46): 54; otherwise 52.
 */
function aiConfidence(game, projection) {
  if (!projection || !projection.hasHistory) {
    return projection && projection.fadeHighTotal ? 54 : 52;
  }
  let score = 52;
  const spread = toNumber(game.spread_line);
  const total = toNumber(game.total_line);
  if (spread != null && projection.projMargin != null) {
    const edge = Math.abs(projection.projMargin - spread);
    score += Math.min(21, edge * 3.5);
  }
  if (total != null && projection.projTotal != null) {
    const edge = Math.abs(projection.projTotal - total);
    score += Math.min(14, edge * 2);
  }
  const n = Number(projection.sampleN) || 0;
  if (n < 8) score -= 10;
  else if (n < 16) score -= 5;
  else if (n < 30) score -= 2;
  else if (n >= 60) score += 4;
  return Math.round(clamp(score, 51, 92));
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
      sampleN: 0,
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
    sampleN: Math.min(home.n, away.n),
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
  const expected = expectedCallLabel(ats, projection.ou);
  const confidence = aiConfidence(game, projection);
  return {
    ats,
    ou: projection.ou,
    ouText,
    label: [ats, ouText].filter(Boolean).join(' · ') || null,
    expected,
    confidence,
    atsTeam: projection.atsTeam || null
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
  const restPct = restAmountWinPct(games, team, rest);
  const ytd = seasonRecord(history, team, game.season, game.kickoff);
  const ctx = {
    team,
    city: teamCity(team),
    side,
    rest,
    showRest: showRestDays(rest),
    showRestWinPct: showRestWinPct(rest),
    short,
    last,
    lastGame: lastGameInfo(team, prev),
    lastFive: lastFiveOutright(history, team, game.kickoff),
    lastFiveAts: lastFiveAts(history, team, game.kickoff),
    record: ytd,
    ytdWinPct: ytd.winPct,
    homeWinPct: homePct,
    awayWinPct: awayPct,
    shortRestWinPct: short ? shortPct : null,
    restWinPct: restPct
  };
  if (side === 'away') {
    const travel = roadTravel(game.away_team, game.home_team);
    if (travel) {
      const travelPct = winPct(games, team, (g, t) => {
        if (teamAbbr(g.away_team) !== t) return false;
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
    kickoffSlot: kickoffSlot(game),
    home_team: game.home_team,
    away_team: game.away_team,
    home_score: game.home_score,
    away_score: game.away_score,
    spread_line: toNumber(game.spread_line),
    total_line: toNumber(game.total_line),
    spread_open: toNumber(game.spread_open != null ? game.spread_open : game.spread_line),
    total_open: toNumber(game.total_open != null ? game.total_open : game.total_line),
    spread_open_at: game.spread_open_at || null,
    total_open_at: game.total_open_at || null,
    spreadMove: spreadMovement(game),
    totalMove: totalMovement(game),
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
  formatSpreadFavorite,
  resolveOpening,
  sinceOpenLabel,
  spreadMovement,
  totalMovement,
  kickoffSlot,
  resultLetter,
  scoringRates,
  projectGame,
  aiPick,
  aiConfidence,
  expectedCallLabel,
  enrichGame,
  currentSeasonWeek,
  pctLabel,
  winPct,
  previousGame,
  lastGameInfo,
  showRestDays,
  showRestWinPct,
  restAmountWinPct,
  lastFiveOutright,
  lastFiveAts,
  lastFiveLetters,
  priorScoredGames,
  seasonRecord,
  formatRecord
};
