'use strict';

const { roadTravel, teamAbbr, teamCity } = require('./teams');
const { toNumber, scoresReady, isLocked, atsLetter, gradeAts, gradeOu, gradeWager } = require('./grader');
const { kickoffSlot } = require('./kickoff-slot');
const { displayConfidence, getActiveMap } = require('./calibration');

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
    if (!letter) continue;
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

const RECENT_KEEP = 6;
const LEAGUE_PPG = 22;
const RATE_PRIOR_GAMES = 4;
const HFA_MARGIN = 2.5;
const SHORT_REST_PENALTY = 1.5;
const BYE_BOOST = 0.75;
const SITE_MIN = 4;

function blankRate() {
  return {
    for: 0,
    against: 0,
    n: 0,
    homeFor: 0,
    homeAgainst: 0,
    homeN: 0,
    awayFor: 0,
    awayAgainst: 0,
    awayN: 0,
    recent: [],
    lastAllowed: null,
    lastScored: null,
    lastQb: null,
    qbByName: new Map()
  };
}

function shrunkMean(sum, n, priorMean, priorN) {
  const nn = Number(n) || 0;
  return ((Number(sum) || 0) + priorMean * priorN) / (nn + priorN);
}

function restPoints(days) {
  const n = toNumber(days);
  if (n == null) return 0;
  if (n <= SHORT_REST_DAYS) return -SHORT_REST_PENALTY;
  if (n >= 11) return BYE_BOOST;
  return 0;
}

function travelPenalty(game) {
  const travel = roadTravel(game.away_team, game.home_team);
  if (!travel || travel.zones < 2) return 0;
  let pen = 0.5 * (travel.zones - 1);
  if (travel.dir === 'east') pen += 0.5;
  return pen;
}

function blendRecent(career, values) {
  if (!values || values.length < 3) return career;
  const recent = values.reduce((sum, v) => sum + v, 0) / values.length;
  const w = Math.min(0.6, 0.2 + values.length * 0.06);
  return career * (1 - w) + recent * w;
}

function offenseDefense(profile, site) {
  const careerOff = shrunkMean(profile.for, profile.n, LEAGUE_PPG, RATE_PRIOR_GAMES);
  const careerDef = shrunkMean(profile.against, profile.n, LEAGUE_PPG, RATE_PRIOR_GAMES);
  const recent = profile.recent || [];
  let off = blendRecent(careerOff, recent.map((g) => g.scored));
  let def = blendRecent(careerDef, recent.map((g) => g.allowed));
  const siteN = site === 'home' ? Number(profile.homeN) || 0 : Number(profile.awayN) || 0;
  const siteFor = site === 'home' ? Number(profile.homeFor) || 0 : Number(profile.awayFor) || 0;
  const siteAg = site === 'home' ? Number(profile.homeAgainst) || 0 : Number(profile.awayAgainst) || 0;
  if (siteN >= SITE_MIN) {
    off = off * 0.45 + (siteFor / siteN) * 0.55;
    def = def * 0.45 + (siteAg / siteN) * 0.55;
  }
  return { off, def, siteN };
}

/**
 * Points projection used by Home AI Pick and Backtest expected calls.
 * Career points are shrunk toward a 22 ppg prior, then blended with the last
 * six games. Home/away splits replace a flat home-field bump once each side
 * has four games at that site; otherwise the home margin gets +2.5. Short
 * rest, bye weeks, and 2+ zone road trips adjust the matchup after that.
 * Only games before kickoff count (missing kickoff uses the whole history).
 */
function projectFromProfiles(game, home, away) {
  const h = offenseDefense(home, 'home');
  const a = offenseDefense(away, 'away');
  let projHome = (h.off + a.def) / 2;
  let projAway = (a.off + h.def) / 2;
  const siteReady = h.siteN >= SITE_MIN && a.siteN >= SITE_MIN;
  if (!siteReady) {
    projHome += HFA_MARGIN / 2;
    projAway -= HFA_MARGIN / 2;
  }
  projHome += restPoints(game.home_rest);
  projAway += restPoints(game.away_rest);
  projAway -= travelPenalty(game);
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
    atsTeam,
    siteAdjusted: siteReady,
    homeLastAllowed: home.lastAllowed == null ? null : home.lastAllowed,
    awayLastAllowed: away.lastAllowed == null ? null : away.lastAllowed,
    homeQb: { lastQb: home.lastQb || null, qbByName: home.qbByName || new Map() },
    awayQb: { lastQb: away.lastQb || null, qbByName: away.qbByName || new Map() }
  };
}

function normQb(name) {
  if (name == null) return null;
  const s = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  return s || null;
}

function addGameToProfile(profile, scored, allowed, site, qbName) {
  profile.for += scored;
  profile.against += allowed;
  profile.n += 1;
  if (site === 'home') {
    profile.homeFor += scored;
    profile.homeAgainst += allowed;
    profile.homeN += 1;
  } else {
    profile.awayFor += scored;
    profile.awayAgainst += allowed;
    profile.awayN += 1;
  }
  profile.recent.push({ scored, allowed });
  if (profile.recent.length > RECENT_KEEP) {
    profile.recent.splice(0, profile.recent.length - RECENT_KEEP);
  }
  profile.lastAllowed = allowed;
  profile.lastScored = scored;
  const qb = normQb(qbName);
  if (qb) {
    if (!profile.qbByName || typeof profile.qbByName.get !== 'function') profile.qbByName = new Map();
    const cur = profile.qbByName.get(qb) || { n: 0, points: 0 };
    cur.n += 1;
    cur.points += scored;
    profile.qbByName.set(qb, cur);
    profile.lastQb = qb;
  }
}

function profileFromHistory(history, team, beforeKickoff) {
  const before = Date.parse(beforeKickoff);
  let games;
  if (Number.isFinite(before)) games = priorScoredGames(history, team, beforeKickoff);
  else {
    games = teamGames(history, team).slice().sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  }
  if (!games.length) return null;
  const profile = blankRate();
  const t = teamAbbr(team);
  for (const g of games) {
    const home = g.home_team === t;
    const scored = home ? toNumber(g.home_score) : toNumber(g.away_score);
    const allowed = home ? toNumber(g.away_score) : toNumber(g.home_score);
    if (scored == null || allowed == null) continue;
    const qb = home ? g.home_qb_name : g.away_qb_name;
    addGameToProfile(profile, scored, allowed, home ? 'home' : 'away', qb);
  }
  return profile.n ? profile : null;
}

function applyGameToRates(rates, game) {
  const hs = toNumber(game.home_score);
  const as = toNumber(game.away_score);
  if (hs == null || as == null) return;
  for (const [team, scored, allowed, site, qb] of [
    [game.home_team, hs, as, 'home', game.home_qb_name],
    [game.away_team, as, hs, 'away', game.away_qb_name]
  ]) {
    const cur = rates.get(team) || blankRate();
    addGameToProfile(cur, scored, allowed, site, qb);
    rates.set(team, cur);
  }
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

function expectedCallLabel(ats, ou, ml) {
  const ouWord = ou === 'over' ? 'Over' : ou === 'under' ? 'Under' : null;
  const side = ats || ml || null;
  if (side && ouWord) return `${side} and ${ouWord}`;
  return side || ouWord || null;
}

const HUGE_DOG_SPREAD = 10;
const BLOWN_DEFENSE_POINTS = 50;
const SMALL_HOME_DOG_MAX = 3;
const HOME_DOG_FADE_MIN_EDGE = 6;
const HIGH_TOTAL = 50;
const UNDER_VETO_RAW = 60;
const UNDER_DISCOUNT = 10;
const UNDER_CONF_CAP = 55;
const BACKUP_MIN_STARTS = 2;
const BACKUP_WORSE_PPG = 7;

function sampleAdj(n) {
  const nn = Number(n) || 0;
  if (nn < 8) return -10;
  if (nn < 16) return -5;
  if (nn < 30) return -2;
  if (nn >= 60) return 4;
  return 0;
}

/**
 * Raw ATS score 51–92 from the spread edge and sample size only.
 * Fed into the isotonic ATS reliability map. Over/under edge is not included.
 * Base 52. +3.5 per |projMargin − spread| (cap +21).
 * Sample n = min(home games, away games): <8 −10, <16 −5, <30 −2, ≥60 +4.
 */
function aiConfidence(game, projection) {
  if (!projection || !projection.hasHistory) return 52;
  let score = 52;
  const spread = toNumber(game.spread_line);
  if (spread != null && projection.projMargin != null) {
    const edge = Math.abs(projection.projMargin - spread);
    score += Math.min(21, edge * 3.5);
  }
  score += sampleAdj(projection.sampleN);
  return Math.round(clamp(score, 51, 92));
}

/**
 * Raw O/U score 51–92 from the total edge and sample size only.
 * Not passed through the ATS hit-rate map. No-history fade of totals ≥46 is 54.
 */
function ouConfidenceRaw(game, projection) {
  if (!projection || !projection.hasHistory) {
    return projection && projection.fadeHighTotal ? 54 : 52;
  }
  let score = 52;
  const total = toNumber(game.total_line);
  if (total != null && projection.projTotal != null) {
    const edge = Math.abs(projection.projTotal - total);
    score += Math.min(21, edge * 3.5);
  }
  score += sampleAdj(projection.sampleN);
  return Math.round(clamp(score, 51, 92));
}

function teamSpread(team, game) {
  const spread = toNumber(game.spread_line);
  if (spread == null || !team) return null;
  return team === game.home_team ? -spread : spread;
}

function projectionEdge(projection, game, team) {
  const spread = toNumber(game.spread_line);
  if (spread == null || !projection || projection.projMargin == null || !team) return 0;
  return team === game.home_team
    ? projection.projMargin - spread
    : spread - projection.projMargin;
}

function outrightWinner(game, projection) {
  if (!projection || !projection.hasHistory || projection.projMargin == null) return null;
  if (projection.projMargin > 0) return game.home_team;
  if (projection.projMargin < 0) return game.away_team;
  return null;
}

function isThursdayNight(game) {
  const wd = String((game && game.weekday) || '').toLowerCase();
  if (wd.startsWith('thu')) return true;
  return kickoffSlot(game) === 'slot-thu';
}

function qbRecord(snapshot, name) {
  if (!snapshot || !snapshot.qbByName || !name) return null;
  const map = snapshot.qbByName;
  if (typeof map.get === 'function') return map.get(name) || null;
  return map[name] || null;
}

function backupIsProblem(snapshot, backupName, starterName) {
  const backup = qbRecord(snapshot, backupName);
  if (!backup || Number(backup.n) < BACKUP_MIN_STARTS) return false;
  const backupPpg = Number(backup.points) / Number(backup.n);
  const starter = qbRecord(snapshot, starterName);
  if (starter && Number(starter.n) >= 1) {
    return backupPpg <= (Number(starter.points) / Number(starter.n)) - BACKUP_WORSE_PPG;
  }
  return backupPpg <= LEAGUE_PPG - BACKUP_WORSE_PPG;
}

/**
 * Side gates. Huge dogs are never the gold ATS pick. A small home dog that
 * just allowed 50+ needs a much larger edge before we fade them. A road
 * favorite that changed quarterbacks is not faded unless the backup's own
 * starts show a real scoring drop.
 */
function guardSides(game, projection, atsTeam) {
  let team = atsTeam || null;
  let mlTeam = null;
  let atsNote = null;
  let atsMarket = team ? 'ats' : null;
  const line = teamSpread(team, game);
  if (team && line != null && line >= HUGE_DOG_SPREAD) {
    const shown = formatLine(line);
    const su = outrightWinner(game, projection);
    if (su && su === team) {
      mlTeam = team;
      atsMarket = 'ml';
      atsNote = `moneyline only — ${team} +${shown} is not an ATS pick`;
    } else {
      atsMarket = 'pass';
      atsNote = `pass ATS — ${team} +${shown}`;
    }
    team = null;
  }
  if (team && team !== game.home_team) {
    const spread = toNumber(game.spread_line);
    const smallHomeDog = spread != null && spread < 0 && Math.abs(spread) <= SMALL_HOME_DOG_MAX;
    const allowed = projection && projection.homeLastAllowed;
    if (smallHomeDog && allowed != null && Number(allowed) >= BLOWN_DEFENSE_POINTS) {
      const edge = projectionEdge(projection, game, team);
      if (edge < HOME_DOG_FADE_MIN_EDGE) {
        atsMarket = 'pass';
        atsNote = `pass ATS — ${game.home_team} allowed ${allowed} last game; small home-dog fade needs a bigger edge`;
        team = null;
      } else {
        atsNote = `flag — fading small home dog ${game.home_team} after ${allowed} points allowed`;
      }
    }
  }
  if (team && team === game.home_team) {
    const spread = toNumber(game.spread_line);
    if (spread != null && spread < 0) {
      const current = normQb(game.away_qb_name);
      const prior = normQb(projection && projection.awayQb && projection.awayQb.lastQb);
      if (current && prior && current !== prior && !backupIsProblem(projection.awayQb, current, prior)) {
        atsMarket = 'pass';
        atsNote = `pass ATS — ${game.away_team} lost starter; backup is not shown as the problem`;
        team = null;
      }
    }
  }
  return { atsTeam: team, mlTeam, atsNote, atsMarket };
}

function guardTotal(game, projection, ouRaw) {
  let ou = projection && projection.ou ? projection.ou : null;
  let ouNote = null;
  let shown = ou ? ouRaw : null;
  const total = toNumber(game.total_line);
  const tnf = isThursdayNight(game);
  const high = total != null && total >= HIGH_TOTAL;
  if (ou === 'under' && (tnf || high)) {
    const why = [];
    if (tnf) why.push('TNF');
    if (high) why.push('total 50+');
    const reason = why.join(' and ');
    if (!projection.hasHistory || ouRaw >= UNDER_VETO_RAW) {
      ou = null;
      shown = null;
      ouNote = `pass under — ${reason}`;
    } else {
      shown = Math.max(51, Math.min(UNDER_CONF_CAP, ouRaw - UNDER_DISCOUNT));
      ouNote = `under discounted — ${reason}`;
    }
  }
  return { ou, ouNote, ouShown: shown, ouRaw: ou ? ouRaw : null };
}

function projectGame(game, history) {
  const home = profileFromHistory(history, game.home_team, game.kickoff);
  const away = profileFromHistory(history, game.away_team, game.kickoff);
  if (!home || !away) {
    const total = toNumber(game.total_line);
    return {
      hasHistory: false,
      projHome: null,
      projAway: null,
      projTotal: null,
      sampleN: 0,
      fadeHighTotal: total != null && total >= 46,
      ou: total != null && total >= 46 ? 'under' : total != null ? 'over' : null,
      homeLastAllowed: null,
      awayLastAllowed: null,
      homeQb: { lastQb: null, qbByName: new Map() },
      awayQb: { lastQb: null, qbByName: new Map() }
    };
  }
  return projectFromProfiles(game, home, away);
}

function projectGameFromRates(game, home, away) {
  if (!home || !away || !home.n || !away.n) {
    return projectGame(game, []);
  }
  const h = {
    ...blankRate(),
    ...home,
    recent: home.recent || [],
    qbByName: home.qbByName || new Map()
  };
  const a = {
    ...blankRate(),
    ...away,
    recent: away.recent || [],
    qbByName: away.qbByName || new Map()
  };
  return projectFromProfiles(game, h, a);
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.001;
}

function signedLineText(line) {
  const shown = formatLine(line);
  if (shown == null) return null;
  return Number(line) > 0 ? `+${shown}` : shown;
}

function finalScores(game) {
  const live = game && game.live;
  const state = live ? String(live.state || '').toLowerCase() : '';
  if (state === 'in') return null;
  const hs = toNumber(game && game.home_score);
  const as = toNumber(game && game.away_score);
  if (hs != null && as != null) return { home: hs, away: as };
  if (live && (state === 'post' || live.completed)) {
    const lh = toNumber(live.home_score);
    const la = toNumber(live.away_score);
    if (lh != null && la != null) return { home: lh, away: la };
  }
  return null;
}

function cardPhase(game) {
  const live = game && game.live;
  const state = live ? String(live.state || '').toLowerCase() : '';
  if (state === 'in') return 'live';
  if (finalScores(game)) return 'final';
  if (state === 'post' || (live && live.completed)) return 'final';
  if (game && game.locked) return 'live';
  return 'pre';
}

/** Every card starts collapsed. The user opens a card or uses Toggle All. */
function defaultExpanded() {
  return false;
}

/**
 * ATS color tone by whether the closing favorite covered.
 * Positive spread_line = home favored. Pick'ems and pushes stay neutral.
 */
function favoriteAtsTone(game, scores) {
  const spread = toNumber(game.spread_line);
  if (spread == null || !scores) return null;
  const margin = scores.home - scores.away;
  if (nearlyEqual(margin, spread)) return 'push';
  if (nearlyEqual(spread, 0)) return 'neutral';
  const homeFavored = spread > 0;
  const homeCovered = margin > spread;
  const favCovered = homeFavored ? homeCovered : !homeCovered;
  return favCovered ? 'cover' : 'fail';
}

/** Closing-line settle copy for a final. Null until both scores are in. */
function settleStrip(game) {
  const scores = finalScores(game);
  if (!scores) return null;
  const home = scores.home;
  const away = scores.away;
  const spread = toNumber(game.spread_line);
  const total = toNumber(game.total_line);
  let coverText = null;
  if (spread != null) {
    const margin = home - away;
    if (nearlyEqual(home, away)) {
      if (nearlyEqual(margin, spread)) coverText = 'SU tie · spread PUSH';
      else {
        const coverTeam = margin > spread ? game.home_team : game.away_team;
        const line = coverTeam === game.home_team ? -spread : spread;
        coverText = `SU tie · ${coverTeam} covered ${signedLineText(line)}`;
      }
    } else {
      const winner = home > away ? game.home_team : game.away_team;
      const winnerLine = winner === game.home_team ? -spread : spread;
      if (nearlyEqual(margin, spread)) {
        coverText = `${winner} push ${signedLineText(winnerLine)}`;
      } else if ((margin > spread ? game.home_team : game.away_team) === winner) {
        coverText = `${winner} covered ${signedLineText(winnerLine)}`;
      } else {
        coverText = `${winner} did NOT cover ${formatLine(Math.abs(spread))}`;
      }
    }
  }
  let totalText = null;
  if (total != null) {
    const sum = home + away;
    const shown = formatLine(total);
    if (nearlyEqual(sum, total)) totalText = `score was PUSH ${shown}`;
    else if (sum > total) totalText = `score was OVER ${shown}`;
    else totalText = `score was UNDER ${shown}`;
  }
  const text = [coverText, totalText].filter(Boolean).join(' ');
  if (!text) return null;
  return {
    coverText,
    totalText,
    text,
    atsTone: coverText ? favoriteAtsTone(game, scores) || 'neutral' : null,
    ouTone: totalText ? 'neutral' : null
  };
}

/** Kickoff ascending, then home team abbr alphabetical (stable slate order). */
function compareWeekGames(a, b) {
  const ka = Date.parse(a && a.kickoff) || 0;
  const kb = Date.parse(b && b.kickoff) || 0;
  if (ka !== kb) return ka - kb;
  return String((a && a.home_team) || '').localeCompare(String((b && b.home_team) || ''));
}

function tallyResults(list) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const r of list) {
    if (r === 'win' || r === 'W') wins += 1;
    else if (r === 'loss' || r === 'L') losses += 1;
    else if (r === 'push' || r === 'P' || r === 'T') ties += 1;
  }
  return {
    wins,
    losses,
    ties,
    graded: wins + losses + ties,
    label: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
  };
}

function weekVersus(cards, options = {}) {
  const signedIn = Boolean(options.signedIn);
  const aiAts = [];
  const aiOu = [];
  const userAts = [];
  const userOu = [];
  const userOut = [];
  for (const card of cards || []) {
    const scores = finalScores(card);
    if (!scores) continue;
    const game = { ...card, home_score: scores.home, away_score: scores.away };
    const ai = card.aiPick || {};
    if (ai.atsTeam) {
      const graded = gradeAts(game, ai.atsTeam);
      if (graded.result !== 'ungraded') aiAts.push(graded.result);
    }
    if (ai.ou) {
      const graded = gradeOu(game, ai.ou);
      if (graded.result !== 'ungraded') aiOu.push(graded.result);
    }
    if (!signedIn) continue;
    for (const w of card.wagers || []) {
      if (!w || !w.market || w.selection == null || w.selection === '') continue;
      let result = w.result;
      if (!result || result === 'ungraded') {
        try {
          result = gradeWager(game, w.market, w.selection).result;
        } catch {
          result = null;
        }
      }
      if (!result || result === 'ungraded') continue;
      if (w.market === 'ats') userAts.push(result);
      else if (w.market === 'ou') userOu.push(result);
      else if (w.market === 'outright') userOut.push(result);
    }
  }
  return {
    signedIn,
    ai: { ats: tallyResults(aiAts), ou: tallyResults(aiOu) },
    user: signedIn ? {
      ats: tallyResults(userAts),
      ou: tallyResults(userOu),
      outright: tallyResults(userOut)
    } : null
  };
}

function annotateCard(card) {
  return {
    ...card,
    phase: cardPhase(card),
    settle: settleStrip(card)
  };
}

function aiPick(game, projection, options = {}) {
  const proj = projection || {};
  const total = formatLine(game.total_line);
  let sideTeam = proj.atsTeam || null;
  if (!sideTeam && !proj.hasHistory && toNumber(game.spread_line) != null) {
    const spread = toNumber(game.spread_line);
    sideTeam = spread > 0 ? game.away_team : game.home_team;
  }
  const sides = guardSides(game, proj, sideTeam);
  const rawAts = sides.atsTeam ? aiConfidence(game, proj) : null;
  const rawOuBase = proj.ou ? ouConfidenceRaw(game, proj) : null;
  const totalGuard = guardTotal(game, proj, rawOuBase == null ? 52 : rawOuBase);
  const map = options.map === undefined
    ? (options.calibrate === false ? null : getActiveMap())
    : options.map;
  const ats = sides.atsTeam ? formatAtsPick(sides.atsTeam, game) : null;
  const ml = sides.mlTeam ? `${sides.mlTeam} ML` : null;
  const atsConfidence = rawAts == null ? null : displayConfidence(rawAts, map);
  let ouText = null;
  if (totalGuard.ou && total != null) {
    const word = totalGuard.ou === 'under' ? 'UNDER' : 'OVER';
    ouText = `take the ${word} ${total}`;
  }
  const sideText = ats || ml || (sides.atsMarket === 'pass' ? sides.atsNote : null);
  const totalText = ouText || totalGuard.ouNote;
  return {
    ats,
    ou: totalGuard.ou,
    ouText,
    ml,
    mlTeam: sides.mlTeam,
    atsMarket: sides.atsMarket,
    atsNote: sides.atsNote,
    ouNote: totalGuard.ouNote,
    label: [sideText, totalText].filter(Boolean).join(' · ') || null,
    expected: expectedCallLabel(ats, totalGuard.ou, ml),
    confidence: atsConfidence,
    atsConfidence,
    ouConfidence: totalGuard.ou ? totalGuard.ouShown : null,
    rawConfidence: rawAts,
    rawAtsConfidence: rawAts,
    rawOuConfidence: totalGuard.ou ? rawOuBase : null,
    atsTeam: sides.atsTeam
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
  projectGameFromRates,
  applyGameToRates,
  aiPick,
  settleStrip,
  favoriteAtsTone,
  compareWeekGames,
  cardPhase,
  defaultExpanded,
  finalScores,
  weekVersus,
  annotateCard,
  tallyResults,
  aiConfidence,
  ouConfidenceRaw,
  expectedCallLabel,
  guardSides,
  guardTotal,
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
