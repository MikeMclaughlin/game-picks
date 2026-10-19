'use strict';

const { gradeAts, gradeOu, scoresReady, toNumber, atsLetter } = require('./grader');
const { formatAtsPick, formatLine, aiPick, projectGameFromRates, applyGameToRates } = require('./week-view');
const { HISTORY_FROM_SEASON } = require('./seasons');

/**
 * Pick-performance criteria.
 *
 * Register another criterion with registerCriterion(). evaluate(game, ctx)
 * returns the pick and graded result for that game (zero or more legs).
 * A leg is { market, selection, label, detail, result } where result is
 * 'win' | 'loss' | 'push' when the game is final and gradeable, otherwise null.
 *
 * ctx.prepared is whatever prepare(ctx) returned (week-level picks, etc.).
 * ctx.aiById maps game_id to a stored ai_picks row.
 */

/**
 * Biggest Loser — one pick per game, not one pick per week.
 *
 * For each regular-season game, take each team's signed margin from its
 * most recent final game earlier in the same season. Margin is that team's
 * points minus the opponent's points: a win is positive, a loss is negative,
 * a tie is 0. A bye uses the last game that team actually played. The pick
 * is the team with the lower signed margin (lost by the most, or, if neither
 * team lost, won by the least).
 *
 * No pick when neither team has a previous game (week 1), when only one
 * team has a previous game, or when the two signed margins tie exactly.
 * No pick, and not graded, when the picked team's point spread is under 4
 * or over 9 in absolute value. That spread is the frozen or stored line
 * when the game has one, otherwise the current line. No line means no pick.
 * A qualifying pick is graded ATS with gradeAts (W-L, or W-L-P on a push).
 * Only final games are graded. An unfinished game that has a pick is pending.
 */
const BIGGEST_LOSER_GLOSSARY = 'Biggest Loser is scored on each regular-season game. For each team, the signed margin is that team’s points minus the opponent’s points in its most recent final game earlier in the season (a win is positive, a loss is negative, a tie is 0). A bye uses the last game played. The pick is the team with the lowest signed margin: the team that lost by the most, or, if neither team lost, the team that won by the least. If neither team has a previous game (week 1), or only one team has a previous game, there is no pick. If the two signed margins tie exactly, that game is skipped. The game is also ignored (no pick, not graded) when the picked team’s point spread is less than 4 or greater than 9 in absolute value. That spread is the frozen or stored line when the game has one, otherwise the current line; if there is no line, there is no pick. Qualifying picks are graded ATS with the same cover rules as wagers (W-L, or W-L-P on a push). Only final games are graded. An unfinished game that has a pick shows as pending.';

/** Inclusive window for the picked team's absolute point spread. */
const SPREAD_ABS_MIN = 4;
const SPREAD_ABS_MAX = 9;

/**
 * Frozen or stored line wins when the game already carries one.
 * gradeAts reads spread_line, so the chosen line is copied there before grading.
 */
const STORED_SPREAD_KEYS = ['spread_frozen', 'frozen_spread', 'spread_close', 'closing_spread', 'stored_spread'];

const AI_PICKS_GLOSSARY = 'AI Picks are the stored snapshots on each game (frozen at kickoff when a freeze was saved), not a fresh recompute. ATS and over/under are graded separately with the same cover and total rules as wagers. Passes are not graded. Only final games count. A week with no final games shows as Pending.';

const criteria = [];

function registerCriterion(def) {
  if (!def || !def.id || typeof def.evaluate !== 'function') {
    throw new Error('A criterion needs an id and an evaluate(game, ctx) function');
  }
  const entry = {
    id: String(def.id),
    name: def.name || String(def.id),
    summary: def.summary || def.name || String(def.id),
    description: def.description || def.glossary || '',
    glossary: def.glossary || def.description || '',
    markets: Array.isArray(def.markets) && def.markets.length ? def.markets.slice() : ['ats'],
    singlePick: Boolean(def.singlePick),
    pickList: Boolean(def.pickList),
    showCurrent: Boolean(def.showCurrent),
    assumption: Boolean(def.assumption),
    pickColumns: Array.isArray(def.pickColumns) ? def.pickColumns : null,
    prepare: typeof def.prepare === 'function' ? def.prepare : null,
    evaluate: def.evaluate
  };
  const idx = criteria.findIndex((c) => c.id === entry.id);
  if (idx >= 0) criteria[idx] = entry;
  else criteria.push(entry);
  return entry;
}

function listCriteria() {
  return criteria.slice();
}

function freshTally() {
  return {
    wins: 0,
    losses: 0,
    pushes: 0,
    graded: 0,
    decided: 0,
    label: '0-0',
    winPct: null,
    pending: false
  };
}

function finishTally(tally) {
  tally.graded = tally.wins + tally.losses + tally.pushes;
  tally.decided = tally.wins + tally.losses;
  tally.label = tally.pushes
    ? `${tally.wins}-${tally.losses}-${tally.pushes}`
    : `${tally.wins}-${tally.losses}`;
  tally.winPct = tally.decided ? tally.wins / tally.decided : null;
  return tally;
}

function bump(tally, result) {
  if (result === 'win') tally.wins += 1;
  else if (result === 'loss') tally.losses += 1;
  else if (result === 'push') tally.pushes += 1;
  else return;
  finishTally(tally);
}

function addTally(into, from) {
  into.wins += from.wins || 0;
  into.losses += from.losses || 0;
  into.pushes += from.pushes || 0;
  return finishTally(into);
}

function isReg(game) {
  return String(game && game.game_type ? game.game_type : 'REG').toUpperCase() === 'REG';
}

function settled(game, market, selection) {
  if (!scoresReady(game) || selection == null || selection === '') return null;
  const graded = market === 'ou' ? gradeOu(game, selection) : gradeAts(game, selection);
  if (!graded || graded.result === 'ungraded') return null;
  return graded.result;
}

function formatSigned(n) {
  const value = toNumber(n);
  if (value == null) return null;
  if (value === 0) return '0';
  const shown = formatLine(Math.abs(value));
  if (shown == null) return null;
  return value > 0 ? `+${shown}` : `-${shown}`;
}

function resultLabel(result) {
  if (result === 'win') return 'W';
  if (result === 'loss') return 'L';
  if (result === 'push') return 'P';
  return 'Pending';
}

/**
 * Line gradeAts should use. A frozen or stored line on the game wins;
 * otherwise the current spread_line. Missing both is no line.
 */
function gradingSpread(game) {
  if (!game) return { line: null, source: null };
  for (const key of STORED_SPREAD_KEYS) {
    if (game[key] == null || game[key] === '') continue;
    const stored = toNumber(game[key]);
    if (stored != null) return { line: stored, source: 'stored' };
  }
  const current = toNumber(game.spread_line);
  if (current != null) return { line: current, source: 'current' };
  return { line: null, source: null };
}

/** Points the team receives. Positive means underdog. Null when the team is not in the game. */
function teamPointSpread(game, team, spreadLine) {
  const spread = toNumber(spreadLine);
  if (spread == null || !team) return null;
  if (team === game.home_team) return -spread;
  if (team === game.away_team) return spread;
  return null;
}

function spreadInWindow(abs) {
  return abs != null && abs >= SPREAD_ABS_MIN && abs <= SPREAD_ABS_MAX;
}

/** Most recent final regular-season game for this team strictly before kickoff. */
function mostRecentFinal(seasonGames, team, beforeMs) {
  let best = null;
  let bestKick = -Infinity;
  for (const game of seasonGames) {
    if (!team || (game.home_team !== team && game.away_team !== team)) continue;
    if (!isReg(game) || !scoresReady(game)) continue;
    const kick = Date.parse(game.kickoff);
    if (!Number.isFinite(kick) || kick >= beforeMs) continue;
    const id = String(game.game_id || '');
    const bestId = best ? String(best.game_id || '') : '';
    if (kick > bestKick || (kick === bestKick && id > bestId)) {
      best = game;
      bestKick = kick;
    }
  }
  return best;
}

function previousMargin(team, prev) {
  if (!prev || !team) return null;
  const teamScore = prev.home_team === team ? toNumber(prev.home_score) : toNumber(prev.away_score);
  const oppScore = prev.home_team === team ? toNumber(prev.away_score) : toNumber(prev.home_score);
  if (teamScore == null || oppScore == null) return null;
  const opponent = prev.home_team === team ? prev.away_team : prev.home_team;
  return {
    margin: teamScore - oppScore,
    teamScore,
    oppScore,
    opponent,
    week: Number(prev.week)
  };
}

/**
 * Pick for one game, or null when the game does not qualify.
 * Both teams need a previous final. Equal signed margins are a skip.
 * The picked side must be getting 4 to 9 points in absolute value.
 */
function pickBiggestLoserGame(seasonGames, game) {
  if (!game || !isReg(game) || !game.home_team || !game.away_team) return null;
  const before = Date.parse(game.kickoff);
  if (!Number.isFinite(before)) return null;
  const sides = [];
  for (const team of [game.away_team, game.home_team]) {
    const prev = mostRecentFinal(seasonGames, team, before);
    const margin = previousMargin(team, prev);
    if (!margin) return null;
    sides.push({ team, ...margin });
  }
  if (sides[0].margin === sides[1].margin) return null;
  const picked = sides[0].margin < sides[1].margin ? sides[0] : sides[1];
  const graded = gradingSpread(game);
  const teamSpread = teamPointSpread(game, picked.team, graded.line);
  if (teamSpread == null || !spreadInWindow(Math.abs(teamSpread))) return null;
  const gradingGame = { ...game, spread_line: graded.line };
  const marginLabel = formatSigned(picked.margin);
  const spreadLabel = formatSigned(teamSpread);
  return {
    market: 'ats',
    selection: picked.team,
    label: formatAtsPick(picked.team, gradingGame),
    detail: `${picked.team} previous margin ${marginLabel} (${picked.team} ${picked.teamScore}-${picked.oppScore} vs ${picked.opponent}, week ${picked.week}). Spread ${spreadLabel}.`,
    result: settled(gradingGame, 'ats', picked.team),
    team: picked.team,
    margin: picked.margin,
    marginLabel,
    spread: teamSpread,
    spreadLabel,
    spreadSource: graded.source,
    opponent: `${game.away_team} @ ${game.home_team}`,
    prevOpponent: picked.opponent,
    prevWeek: picked.week,
    prevScore: `${picked.teamScore}-${picked.oppScore}`,
    game_id: game.game_id,
    kickoff: game.kickoff,
    week: Number(game.week)
  };
}

function prepareBiggestLoser(ctx) {
  const picks = new Map();
  for (const game of ctx.seasonGames) {
    const leg = pickBiggestLoserGame(ctx.seasonGames, game);
    if (leg) picks.set(game.game_id, leg);
  }
  return picks;
}

function evaluateBiggestLoser(game, ctx) {
  const picks = ctx.prepared;
  if (!picks || typeof picks.get !== 'function') return [];
  const leg = picks.get(game.game_id);
  return leg ? [leg] : [];
}

function pickRowFromLeg(leg) {
  return {
    game_id: leg.game_id || null,
    week: leg.week != null ? Number(leg.week) : null,
    team: leg.team || leg.selection || null,
    label: leg.label || null,
    detail: leg.detail || null,
    margin: leg.margin != null ? leg.margin : null,
    marginLabel: leg.marginLabel || null,
    spread: leg.spread != null ? leg.spread : null,
    spreadLabel: leg.spreadLabel || null,
    spreadSource: leg.spreadSource || null,
    result: leg.result || null,
    resultLabel: resultLabel(leg.result),
    opponent: leg.opponent || null,
    prevOpponent: leg.prevOpponent || null,
    prevWeek: leg.prevWeek != null ? leg.prevWeek : null,
    prevScore: leg.prevScore || null,
    kickoff: leg.kickoff || null
  };
}

function comparePicks(a, b) {
  const ka = Date.parse(a.kickoff) || 0;
  const kb = Date.parse(b.kickoff) || 0;
  if (ka !== kb) return ka - kb;
  return String(a.team || '').localeCompare(String(b.team || ''));
}

function parsePick(row) {
  if (!row) return null;
  let payload = row.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  return payload;
}

function evaluateAiPicks(game, ctx) {
  const row = ctx.aiById && ctx.aiById.get(game.game_id);
  const pick = parsePick(row);
  if (!pick) return [];
  const legs = [];
  if (pick.atsTeam) {
    legs.push({
      market: 'ats',
      selection: pick.atsTeam,
      label: pick.ats || pick.atsTeam,
      detail: row.frozen_at ? 'Frozen at lock' : 'Stored AI pick',
      result: settled(game, 'ats', pick.atsTeam)
    });
  }
  if (pick.ou) {
    legs.push({
      market: 'ou',
      selection: pick.ou,
      label: pick.ouText || pick.ou,
      detail: row.frozen_at ? 'Frozen at lock' : 'Stored AI pick',
      result: settled(game, 'ou', pick.ou)
    });
  }
  return legs;
}

registerCriterion({
  id: 'ai-picks',
  name: 'AI Picks',
  summary: 'Stored AI picks, ATS and over/under',
  glossary: AI_PICKS_GLOSSARY,
  description: AI_PICKS_GLOSSARY,
  markets: ['ats', 'ou'],
  showCurrent: true,
  evaluate: evaluateAiPicks
});

registerCriterion({
  id: 'biggest-loser',
  name: 'Biggest Loser Picks',
  summary: 'Per game: lowest previous margin, absolute spread 4 to 9, graded ATS',
  glossary: BIGGEST_LOSER_GLOSSARY,
  description: BIGGEST_LOSER_GLOSSARY,
  markets: ['ats'],
  pickList: true,
  pickColumns: [
    { key: 'week', label: 'Week', title: 'NFL week number for this pick' },
    { key: 'team', label: 'Team', title: 'Team picked for this game: the side with the lower signed margin from its previous game' },
    { key: 'margin', label: 'Previous margin', title: 'Signed margin of the picked team’s most recent final game earlier this season. Team points minus opponent points. A win is positive, a loss is negative, and a bye uses the last game played.' },
    { key: 'spread', label: 'Spread', title: 'Picked team’s point spread for this game. Positive means points received. Absolute value must be from 4 through 9. Uses the frozen or stored line when present, otherwise the current line.' },
    { key: 'result', label: 'Result', title: 'ATS result for a final game: W is a cover, L is a miss, P is a push. Pending means the game is not final and is not graded.' }
  ],
  prepare: prepareBiggestLoser,
  evaluate: evaluateBiggestLoser
});

/**
 * Comeback Kid — ATS any underdog whose previous same-season game missed
 * the spread by 21 or more. ATS margin is team score margin plus the points
 * that team was getting. Graded on the frozen or stored line, else the current line.
 */
const COMEBACK_KID_GLOSSARY = 'Comeback Kid is scored on each regular-season game. A team qualifies when it is the underdog in this game (getting points; a pick’em is not a dog) and its previous final game in the same season missed the spread by 21 or more points. That previous ATS margin is the team’s score margin plus the points it was getting (team margin + team line). A margin of -21 or lower qualifies. The pick is graded ATS on this week’s frozen or stored line when the game has one, otherwise the current line. Only final games are graded. An unfinished game that has a pick shows as pending.';

function previousAtsMargin(team, prev) {
  const scored = previousMargin(team, prev);
  if (!scored) return null;
  const graded = gradingSpread(prev);
  const line = teamPointSpread(prev, team, graded.line);
  if (line == null) return null;
  return { ...scored, atsMargin: scored.margin + line, prevLine: line };
}

function pickComebackKidGame(seasonGames, game) {
  if (!game || !isReg(game) || !game.home_team || !game.away_team) return null;
  const before = Date.parse(game.kickoff);
  if (!Number.isFinite(before)) return null;
  const graded = gradingSpread(game);
  let picked = null;
  for (const team of [game.away_team, game.home_team]) {
    const dogLine = teamPointSpread(game, team, graded.line);
    if (dogLine == null || dogLine <= 0) continue;
    const prev = mostRecentFinal(seasonGames, team, before);
    const prevAts = previousAtsMargin(team, prev);
    if (!prevAts || prevAts.atsMargin > -21) continue;
    picked = { team, dogLine, ...prevAts };
    break;
  }
  if (!picked) return null;
  const gradingGame = graded.line == null ? game : { ...game, spread_line: graded.line };
  const marginLabel = formatSigned(picked.atsMargin);
  const spreadLabel = formatSigned(picked.dogLine);
  return {
    market: 'ats',
    selection: picked.team,
    label: formatAtsPick(picked.team, gradingGame),
    detail: `${picked.team} previous ATS margin ${marginLabel} (score margin ${formatSigned(picked.margin)} plus line ${formatSigned(picked.prevLine)} vs ${picked.opponent}, week ${picked.week}). This week ${spreadLabel}.`,
    result: settled(gradingGame, 'ats', picked.team),
    team: picked.team,
    margin: picked.atsMargin,
    marginLabel,
    spread: picked.dogLine,
    spreadLabel,
    spreadSource: graded.source,
    opponent: `${game.away_team} @ ${game.home_team}`,
    prevOpponent: picked.opponent,
    prevWeek: picked.week,
    prevScore: `${picked.teamScore}-${picked.oppScore}`,
    game_id: game.game_id,
    kickoff: game.kickoff,
    week: Number(game.week)
  };
}

function prepareComebackKid(ctx) {
  const picks = new Map();
  for (const game of ctx.seasonGames) {
    const leg = pickComebackKidGame(ctx.seasonGames, game);
    if (leg) picks.set(game.game_id, leg);
  }
  return picks;
}

function evaluateComebackKid(game, ctx) {
  const picks = ctx.prepared;
  if (!picks || typeof picks.get !== 'function') return [];
  const leg = picks.get(game.game_id);
  return leg ? [leg] : [];
}

registerCriterion({
  id: 'comeback-kid',
  name: 'Comeback Kid',
  summary: 'ATS underdog after missing the spread by 21 or more last game',
  glossary: COMEBACK_KID_GLOSSARY,
  description: COMEBACK_KID_GLOSSARY,
  markets: ['ats'],
  pickList: true,
  pickColumns: [
    { key: 'week', label: 'Week', title: 'NFL week number for this pick' },
    { key: 'team', label: 'Team', title: 'Underdog picked ATS after missing the spread by 21 or more in its previous same-season game' },
    { key: 'margin', label: 'Previous ATS margin', title: 'Previous-game ATS margin: team score margin plus the points that team was getting. Qualifying picks are -21 or lower.' },
    { key: 'spread', label: 'Spread', title: 'Points this underdog is getting this week. Positive means points received. Graded on the frozen or stored line when present, otherwise the current line.' },
    { key: 'result', label: 'Result', title: 'ATS result for a final game: W is a cover, L is a miss, P is a push. Pending means the game is not final and is not graded.' }
  ],
  prepare: prepareComebackKid,
  evaluate: evaluateComebackKid
});

const PASS_RULES = [
  { id: 'plus-10-dog', name: '+10 dog ban', markets: ['ats'] },
  { id: 'plus-9-dog', name: '+9 dog pass', markets: ['ats'] },
  { id: 'tnf-under', name: 'TNF under veto', markets: ['ou'] },
  { id: 'under-50', name: '50+ under pass', markets: ['ou'] },
  { id: 'over-48', name: '48+ over pass', markets: ['ou'] },
  { id: 'small-edge-ou', name: 'Small-edge O/U pass', markets: ['ou'] },
  { id: 'early-season', name: 'Early-season pass', markets: ['ats', 'ou'] },
  { id: 'side-flip', name: 'Side-flip pass', markets: ['ats'] },
  { id: 'heavy-dog-losing', name: 'Heavy dog, losing ATS record', markets: ['ats'] }
];

function gradePassLeg(game, pass) {
  if (!pass || !pass.selection) return null;
  if (pass.market === 'ou') return settled(game, 'ou', pass.selection);
  const graded = gradingSpread(game);
  const gradingGame = graded.line == null ? game : { ...game, spread_line: graded.line };
  return settled(gradingGame, 'ats', pass.selection);
}

function emptyAtsRec() {
  return { covers: 0, fails: 0 };
}

function sideFlipPasses(row) {
  const payload = parsePick(row);
  if (!payload) return [];
  const listed = Array.isArray(payload.passes) ? payload.passes.filter((item) => item && item.rule === 'side-flip' && item.selection) : [];
  if (listed.length) return listed.map((item) => ({ ...item, market: 'ats', rule: 'side-flip' }));
  if (payload.atsFlipped && payload.wouldHaveAtsTeam) {
    return [{ rule: 'side-flip', market: 'ats', selection: payload.wouldHaveAtsTeam, note: 'pass ATS — side flipped' }];
  }
  return [];
}

function replayPassEvents(games, season, aiById) {
  const sorted = [...(games || [])]
    .filter((game) => String(game.game_type || 'REG').toUpperCase() !== 'PRE' && Number(game.season) >= HISTORY_FROM_SEASON && Number(game.season) <= Number(season))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || String(a.game_id).localeCompare(String(b.game_id)));
  const rates = new Map();
  const records = new Map();
  const events = [];
  for (const game of sorted) {
    const seasonAts = {};
    for (const team of [game.home_team, game.away_team]) {
      seasonAts[team] = records.get(`${game.season}|${team}`) || emptyAtsRec();
    }
    const inSeason = Number(game.season) === Number(season) && isReg(game);
    if (inSeason) {
      const projection = projectGameFromRates(game, rates.get(game.home_team), rates.get(game.away_team));
      const pick = aiPick(game, projection, { calibrate: false, seasonAts });
      for (const pass of pick.passes || []) {
        if (!pass || !pass.rule || !pass.selection) continue;
        events.push({
          rule: pass.rule,
          market: pass.market,
          selection: pass.selection,
          week: Number(game.week),
          result: gradePassLeg(game, pass),
          game_id: game.game_id
        });
      }
      const row = aiById && aiById.get(game.game_id);
      for (const pass of sideFlipPasses(row)) {
        events.push({
          rule: 'side-flip',
          market: 'ats',
          selection: pass.selection,
          week: Number(game.week),
          result: gradePassLeg(game, { market: 'ats', selection: pass.selection }),
          game_id: game.game_id
        });
      }
    }
    if (scoresReady(game)) {
      applyGameToRates(rates, game);
      for (const team of [game.home_team, game.away_team]) {
        const key = `${game.season}|${team}`;
        const rec = records.get(key) || emptyAtsRec();
        const letter = atsLetter(game, team);
        if (letter === 'C') rec.covers += 1;
        else if (letter === 'F') rec.fails += 1;
        records.set(key, rec);
      }
    }
  }
  return events;
}

function buildPassReport(ctxBase) {
  const events = replayPassEvents(ctxBase.games, ctxBase.season, ctxBase.aiById);
  const weeksPresent = [...new Set(ctxBase.seasonGames.map((game) => Number(game.week)))].sort((a, b) => a - b);
  const finalsByWeek = new Map();
  for (const game of ctxBase.seasonGames) {
    const week = Number(game.week);
    if (!finalsByWeek.has(week)) finalsByWeek.set(week, 0);
    if (scoresReady(game)) finalsByWeek.set(week, finalsByWeek.get(week) + 1);
  }
  const rules = PASS_RULES.map((rule) => {
    const mine = events.filter((event) => event.rule === rule.id);
    const year = { ats: freshTally(), ou: freshTally() };
    const weeks = [];
    for (const week of weeksPresent) {
      const legs = mine.filter((event) => event.week === week);
      if (!legs.length) continue;
      const markets = { ats: freshTally(), ou: freshTally() };
      let gradedAny = false;
      let ungradedAny = false;
      for (const leg of legs) {
        const market = leg.market === 'ou' ? 'ou' : 'ats';
        if (!rule.markets.includes(market)) continue;
        if (leg.result) {
          bump(markets[market], leg.result);
          gradedAny = true;
        } else ungradedAny = true;
      }
      const finals = finalsByWeek.get(week) || 0;
      const pending = finals === 0 || (!gradedAny && ungradedAny);
      if (pending) {
        for (const market of rule.markets) {
          markets[market] = {
            wins: 0, losses: 0, pushes: 0, graded: 0, decided: 0, label: 'Pending', winPct: null, pending: true
          };
        }
      } else {
        for (const market of rule.markets) {
          if (!markets[market].graded) markets[market] = { ...markets[market], pending: false, label: '—', winPct: null };
          else {
            markets[market] = { ...markets[market], pending: false };
            addTally(year[market], markets[market]);
          }
        }
      }
      weeks.push({ week, pending, markets });
    }
    for (const market of ['ats', 'ou']) {
      if (!rule.markets.includes(market)) {
        year[market] = { wins: 0, losses: 0, pushes: 0, graded: 0, decided: 0, label: '—', winPct: null, pending: false };
      } else if (!year[market].graded) {
        year[market] = { ...finishTally(year[market]), label: '0-0', winPct: null, pending: false };
      }
    }
    return {
      id: rule.id,
      name: rule.name,
      markets: rule.markets,
      weeks,
      year: { markets: year }
    };
  });
  return { rules };
}

function regSeasonGames(games, season) {
  return (games || []).filter((game) => Number(game.season) === Number(season) && isReg(game));
}

function buildCriterionReport(criterion, ctxBase) {
  const prepared = criterion.prepare ? criterion.prepare(ctxBase) : null;
  const ctx = { ...ctxBase, prepared };
  const byWeek = new Map();
  for (const game of ctxBase.seasonGames) {
    const week = Number(game.week);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(game);
  }
  const yearMarkets = {};
  for (const market of criterion.markets) yearMarkets[market] = freshTally();
  const weeks = [];
  const weekNums = [...byWeek.keys()].sort((a, b) => a - b);
  for (const week of weekNums) {
    const games = byWeek.get(week);
    const finals = games.filter((game) => scoresReady(game)).length;
    const legs = [];
    const picks = [];
    let pick = null;
    let pickDetail = null;
    for (const game of games) {
      const found = criterion.evaluate(game, ctx) || [];
      for (const leg of found) {
        if (!leg || !leg.market) continue;
        legs.push(leg);
        if (criterion.singlePick && leg.label) {
          pick = leg.label;
          pickDetail = leg.detail || null;
        }
        if (criterion.pickList) picks.push(pickRowFromLeg(leg));
      }
    }
    if (criterion.pickList) picks.sort(comparePicks);
    let gradedAny = false;
    let ungradedAny = false;
    const markets = {};
    for (const market of criterion.markets) {
      const tally = freshTally();
      for (const leg of legs) {
        if (leg.market !== market) continue;
        if (leg.result) {
          bump(tally, leg.result);
          gradedAny = true;
        } else {
          ungradedAny = true;
        }
      }
      markets[market] = tally;
    }
    const pending = finals === 0 || (!gradedAny && ungradedAny);
    for (const market of criterion.markets) {
      const tally = markets[market];
      if (pending) {
        markets[market] = {
          wins: 0,
          losses: 0,
          pushes: 0,
          graded: 0,
          decided: 0,
          label: 'Pending',
          winPct: null,
          pending: true
        };
      } else if (!tally.graded) {
        markets[market] = { ...tally, pending: false, label: '—', winPct: null };
      } else {
        markets[market] = { ...tally, pending: false };
        addTally(yearMarkets[market], tally);
      }
    }
    const weekRow = {
      week,
      pending,
      games: games.length,
      finals,
      pick,
      pickDetail,
      markets
    };
    if (criterion.pickList) weekRow.picks = picks;
    weeks.push(weekRow);
  }
  return {
    id: criterion.id,
    name: criterion.name,
    summary: criterion.summary,
    description: criterion.description,
    glossary: criterion.glossary,
    markets: criterion.markets,
    singlePick: criterion.singlePick,
    pickList: criterion.pickList,
    pickColumns: criterion.pickColumns,
    showCurrent: criterion.showCurrent,
    assumption: criterion.assumption,
    weeks,
    year: { markets: yearMarkets }
  };
}

function buildPerformance({ games, season, seasons, aiRows, currentSeason }) {
  const seasonGames = regSeasonGames(games, season);
  const aiById = new Map();
  for (const row of aiRows || []) {
    if (!row || !row.game_id) continue;
    if (row.season != null && Number(row.season) !== Number(season)) continue;
    aiById.set(row.game_id, row);
  }
  const ctxBase = { games, seasonGames, season: Number(season), aiById };
  const reports = criteria.map((criterion) => buildCriterionReport(criterion, ctxBase));
  return {
    season: Number(season),
    currentSeason: Number(currentSeason),
    isCurrentSeason: Number(season) === Number(currentSeason),
    seasons: seasons || [],
    criteria: reports,
    passes: buildPassReport(ctxBase)
  };
}

function marketSnap(criterion, market) {
  const tally = criterion && criterion.year && criterion.year.markets && criterion.year.markets[market];
  if (!tally || !tally.graded) {
    return { label: '0-0', winPct: null, wins: 0, losses: 0, pushes: 0 };
  }
  return {
    label: tally.label,
    winPct: tally.winPct,
    wins: tally.wins,
    losses: tally.losses,
    pushes: tally.pushes
  };
}

function viewCategoryPick(leg) {
  if (!leg || !leg.selection) return null;
  return {
    team: leg.team || leg.selection,
    label: leg.label || null,
    result: leg.result || null
  };
}

/** Same Biggest Loser and Comeback Kid legs Pick Performance uses, keyed onto week cards. */
function attachCategoryPicks(cards, games, season) {
  const seasonGames = regSeasonGames(games, season);
  const ctx = { games, seasonGames, season: Number(season), aiById: new Map() };
  const biggest = prepareBiggestLoser(ctx);
  const comeback = prepareComebackKid(ctx);
  return (cards || []).map((card) => {
    const id = card && card.game_id;
    return {
      ...card,
      biggestLoser: viewCategoryPick(id ? biggest.get(id) : null),
      comebackKid: viewCategoryPick(id ? comeback.get(id) : null)
    };
  });
}

function performanceTotals(report) {
  const list = (report && report.criteria) || [];
  const byId = new Map(list.map((criterion) => [criterion.id, criterion]));
  return {
    season: report ? report.season : null,
    aiAts: marketSnap(byId.get('ai-picks'), 'ats'),
    aiOu: marketSnap(byId.get('ai-picks'), 'ou'),
    biggestLoser: marketSnap(byId.get('biggest-loser'), 'ats'),
    comebackKid: marketSnap(byId.get('comeback-kid'), 'ats')
  };
}

module.exports = {
  BIGGEST_LOSER_GLOSSARY,
  AI_PICKS_GLOSSARY,
  SPREAD_ABS_MIN,
  SPREAD_ABS_MAX,
  registerCriterion,
  listCriteria,
  gradingSpread,
  pickBiggestLoserGame,
  pickComebackKidGame,
  COMEBACK_KID_GLOSSARY,
  PASS_RULES,
  buildPerformance,
  performanceTotals,
  attachCategoryPicks
};
