'use strict';

const { gradeAts, gradeOu, scoresReady, toNumber } = require('./grader');
const { formatAtsPick, resultLetter } = require('./week-view');

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
 * Biggest Loser — ASSUMPTION.
 * Nothing in the repo, schema, or comments defined this criterion.
 * Change BIGGEST_LOSER_GLOSSARY and chooseBiggestLoser together.
 *
 * Each regular-season week produces one pick: the team with the worst
 * record entering that week (before the week's first kickoff, so Thursday
 * does not change Sunday's record). Win % = wins / (wins + losses). Ties
 * are ignored. A team with no decided games ranks as .500, so week 1 is a
 * full tie. Ties break to the larger point-spread underdog (more points
 * received on the closing spread; favorites receive a negative number).
 * If that is also level, the alphabetically later abbreviation is used.
 * The pick is graded ATS with gradeAts (cover = win, miss = loss, push = P).
 * Only final games count. A week with no graded final is Pending.
 */
const BIGGEST_LOSER_GLOSSARY = 'Biggest Loser is an assumption (no earlier definition in this app). Each regular-season week, the pick is the team with the worst record entering that week: win % is wins ÷ (wins + losses), ties ignored, and no decided games ranks as .500. Ties break to the larger point-spread underdog (more points received). A remaining tie uses the alphabetically later abbreviation. Graded by whether that team covers the spread (ATS). Only final games count; a week that is not final shows as Pending.';

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
    showCurrent: Boolean(def.showCurrent),
    assumption: Boolean(def.assumption),
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

function enteringRecord(seasonGames, team, season, beforeMs) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const game of seasonGames) {
    if (Number(game.season) !== Number(season) || !isReg(game)) continue;
    if (game.home_team !== team && game.away_team !== team) continue;
    const kick = Date.parse(game.kickoff);
    if (!Number.isFinite(kick) || kick >= beforeMs) continue;
    const letter = resultLetter(team, game);
    if (letter === 'W') wins += 1;
    else if (letter === 'L') losses += 1;
    else if (letter === 'T') ties += 1;
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    ties,
    decided,
    label: ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
    rankPct: decided ? wins / decided : 0.5
  };
}

/** Points the team receives on the closing spread. Positive means underdog. */
function pointsReceived(game, team) {
  const spread = toNumber(game.spread_line);
  if (spread == null) return null;
  if (team === game.home_team) return -spread;
  if (team === game.away_team) return spread;
  return null;
}

function weekStartMs(games) {
  let min = Infinity;
  for (const game of games) {
    const kick = Date.parse(game.kickoff);
    if (Number.isFinite(kick) && kick < min) min = kick;
  }
  return Number.isFinite(min) ? min : 0;
}

function worseThan(a, b) {
  if (a.rec.rankPct !== b.rec.rankPct) return a.rec.rankPct < b.rec.rankPct;
  if (a.dog !== b.dog) return a.dog > b.dog;
  return String(a.team).localeCompare(String(b.team)) > 0;
}

function chooseBiggestLoser(seasonGames, weekGames, season) {
  const start = weekStartMs(weekGames);
  let best = null;
  for (const game of weekGames) {
    for (const team of [game.away_team, game.home_team]) {
      if (!team) continue;
      const rec = enteringRecord(seasonGames, team, season, start);
      const dog = pointsReceived(game, team);
      const row = {
        game,
        team,
        rec,
        dog: dog == null ? Number.NEGATIVE_INFINITY : dog
      };
      if (!best || worseThan(row, best)) best = row;
    }
  }
  if (!best) return null;
  return {
    game_id: best.game.game_id,
    team: best.team,
    week: Number(best.game.week),
    record: best.rec.label,
    label: formatAtsPick(best.team, best.game),
    detail: `${best.team} entered ${best.rec.label} before this week`
  };
}

function prepareBiggestLoser(ctx) {
  const byWeek = new Map();
  for (const game of ctx.seasonGames) {
    const week = Number(game.week);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(game);
  }
  const picks = new Map();
  for (const [week, games] of byWeek) {
    const choice = chooseBiggestLoser(ctx.seasonGames, games, ctx.season);
    if (choice) picks.set(week, choice);
  }
  return picks;
}

function evaluateBiggestLoser(game, ctx) {
  const picks = ctx.prepared;
  if (!picks || typeof picks.get !== 'function') return [];
  const choice = picks.get(Number(game.week));
  if (!choice || choice.game_id !== game.game_id) return [];
  return [{
    market: 'ats',
    selection: choice.team,
    label: choice.label,
    detail: choice.detail,
    result: settled(game, 'ats', choice.team)
  }];
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
  summary: 'Worst record entering the week, graded ATS',
  glossary: BIGGEST_LOSER_GLOSSARY,
  description: BIGGEST_LOSER_GLOSSARY,
  markets: ['ats'],
  singlePick: true,
  assumption: true,
  prepare: prepareBiggestLoser,
  evaluate: evaluateBiggestLoser
});

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
      }
    }
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
    weeks.push({
      week,
      pending,
      games: games.length,
      finals,
      pick,
      pickDetail,
      markets
    });
  }
  return {
    id: criterion.id,
    name: criterion.name,
    summary: criterion.summary,
    description: criterion.description,
    glossary: criterion.glossary,
    markets: criterion.markets,
    singlePick: criterion.singlePick,
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
  return {
    season: Number(season),
    currentSeason: Number(currentSeason),
    isCurrentSeason: Number(season) === Number(currentSeason),
    seasons: seasons || [],
    criteria: criteria.map((criterion) => buildCriterionReport(criterion, ctxBase))
  };
}

module.exports = {
  BIGGEST_LOSER_GLOSSARY,
  AI_PICKS_GLOSSARY,
  registerCriterion,
  listCriteria,
  chooseBiggestLoser,
  enteringRecord,
  pointsReceived,
  buildPerformance
};
