'use strict';

/**
 * Brier / reliability calibration for AI Pick confidence.
 *
 * Target: ATS hit rate (covers vs fails; pushes excluded). Joint ATS+OU is
 * harsher and not what Home "confidence" is calibrated to. Over/under is
 * still shown on the card but is not the reliability target.
 *
 * Fit: walk 2016+ scored REG games the same way Backtest expected calls do
 * (prior games only, same projection as Current Week — recent form, site,
 * rest, travel, and home field), take the raw 51–92 rule score, grade the ATS
 * side, then map raw → empirical hit rate with shrinkage + isotonic (PAVA)
 * so the curve cannot invert. Recalculated from stored games at bootstrap
 * and Backtest — not a hand-tuned table. The map does not choose the side.
 */

const { scoresReady, atsLetter, toNumber } = require('./grader');
const { HISTORY_FROM_SEASON } = require('./seasons');

const CALIBRATION_TARGET = 'ats';
const PRIOR_STRENGTH = 12;
const DISPLAY_MIN = 1;
const DISPLAY_MAX = 99;

const CALIBRATION_NOTE = 'Displayed confidence is a calibrated historical ATS hit rate (2016+ scored regular-season games). The raw 51–92 edge/sample rule is mapped with isotonic (monotone) reliability so this % tracks ATS hit rate by raw-score bucket. Over/under is graded separately and is not the calibration target.';

let activeMap = null;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round4(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

/** Mean squared error of probability vs binary outcome (Brier). */
function brierScore(pairs) {
  if (!pairs || !pairs.length) return null;
  let sum = 0;
  for (const pair of pairs) {
    const p = Number(pair.p);
    const y = Number(pair.y);
    if (!Number.isFinite(p) || !Number.isFinite(y)) continue;
    const d = p - y;
    sum += d * d;
  }
  const n = pairs.filter((pair) => Number.isFinite(Number(pair.p)) && Number.isFinite(Number(pair.y))).length;
  return n ? sum / n : null;
}

/**
 * Weighted pool-adjacent-violators: non-decreasing means.
 * values[i] is the rate at sorted knot i; weights[i] is the bucket N (or prior mass).
 */
function pavaNonDecreasing(values, weights) {
  const n = values.length;
  if (!n) return [];
  const blocks = [];
  for (let i = 0; i < n; i += 1) {
    const w = Number(weights[i]);
    const weight = Number.isFinite(w) && w > 0 ? w : 1;
    blocks.push({
      start: i,
      end: i,
      sum: Number(values[i]) * weight,
      weight
    });
    while (blocks.length >= 2) {
      const prev = blocks[blocks.length - 2];
      const cur = blocks[blocks.length - 1];
      if (prev.sum / prev.weight <= cur.sum / cur.weight) break;
      prev.end = cur.end;
      prev.sum += cur.sum;
      prev.weight += cur.weight;
      blocks.pop();
    }
  }
  const out = new Array(n);
  for (const block of blocks) {
    const mean = block.sum / block.weight;
    for (let i = block.start; i <= block.end; i += 1) out[i] = mean;
  }
  return out;
}

function shrunkRate(hits, n, prior) {
  const p = Number.isFinite(prior) ? clamp(prior, 0, 1) : 0.5;
  const nn = Math.max(0, Number(n) || 0);
  const hh = Math.max(0, Number(hits) || 0);
  return (hh + PRIOR_STRENGTH * p) / (nn + PRIOR_STRENGTH);
}

function fitReliabilityMap(samples) {
  const buckets = new Map();
  for (const sample of samples || []) {
    const raw = Math.round(Number(sample.raw));
    if (!Number.isFinite(raw)) continue;
    const hit = Number(sample.hit);
    if (hit !== 0 && hit !== 1) continue;
    const cur = buckets.get(raw) || { raw, n: 0, hits: 0 };
    cur.n += 1;
    cur.hits += hit;
    buckets.set(raw, cur);
  }
  const sorted = [...buckets.values()].sort((a, b) => a.raw - b.raw);
  if (!sorted.length) {
    return {
      target: CALIBRATION_TARGET,
      knots: [],
      decided: 0,
      buckets: 0
    };
  }
  const empirical = sorted.map((b) => (b.n ? b.hits / b.n : 0.5));
  const priors = sorted.map((b) => clamp(b.raw / 100, 0, 1));
  const shrunk = sorted.map((b, i) => shrunkRate(b.hits, b.n, priors[i]));
  const weights = sorted.map((b) => b.n + PRIOR_STRENGTH);
  const isotonic = pavaNonDecreasing(shrunk, weights);
  const knots = sorted.map((b, i) => ({
    raw: b.raw,
    n: b.n,
    hits: b.hits,
    empirical: empirical[i],
    shrunk: shrunk[i],
    p: clamp(isotonic[i], 0.01, 0.99)
  }));
  let decided = 0;
  for (const b of sorted) decided += b.n;
  return {
    target: CALIBRATION_TARGET,
    knots,
    decided,
    buckets: knots.length
  };
}

function interpolateP(raw, map) {
  const x = Number(raw);
  if (!Number.isFinite(x)) return 0.5;
  if (!map || !map.knots || !map.knots.length) {
    return clamp(x / 100, 0.01, 0.99);
  }
  const knots = map.knots;
  if (x <= knots[0].raw) return knots[0].p;
  if (x >= knots[knots.length - 1].raw) return knots[knots.length - 1].p;
  for (let i = 1; i < knots.length; i += 1) {
    const b = knots[i];
    if (x <= b.raw) {
      const a = knots[i - 1];
      if (b.raw === a.raw) return b.p;
      const t = (x - a.raw) / (b.raw - a.raw);
      return a.p + t * (b.p - a.p);
    }
  }
  return knots[knots.length - 1].p;
}

function displayConfidence(raw, map = activeMap) {
  if (!map || !map.knots || !map.knots.length) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return null;
    return Math.round(clamp(n, DISPLAY_MIN, DISPLAY_MAX));
  }
  const p = interpolateP(raw, map);
  return Math.round(100 * clamp(p, DISPLAY_MIN / 100, DISPLAY_MAX / 100));
}

function getActiveMap() {
  return activeMap;
}

function setActiveMap(map) {
  activeMap = map || null;
  return activeMap;
}

function resetCalibration() {
  activeMap = null;
}

function bumpScoringRates(rates, game) {
  const { applyGameToRates } = require('./week-view');
  applyGameToRates(rates, game);
}

function collectAtsSamples(games) {
  const { aiConfidence, projectGameFromRates } = require('./week-view');
  const sorted = [...(games || [])]
    .filter((g) => scoresReady(g) && g.game_type !== 'PRE' && Number(g.season) >= HISTORY_FROM_SEASON)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || String(a.game_id).localeCompare(String(b.game_id)));
  const rates = new Map();
  const samples = [];
  for (const game of sorted) {
    const projection = projectGameFromRates(game, rates.get(game.home_team), rates.get(game.away_team));
    const raw = aiConfidence(game, projection);
    let atsTeam = projection.atsTeam || null;
    if (!atsTeam && !projection.hasHistory && toNumber(game.spread_line) != null) {
      atsTeam = toNumber(game.spread_line) > 0 ? game.away_team : game.home_team;
    }
    if (atsTeam) {
      const letter = atsLetter(game, atsTeam);
      if (letter === 'C') samples.push({ raw, hit: 1, game_id: game.game_id });
      else if (letter === 'F') samples.push({ raw, hit: 0, game_id: game.game_id });
    }
    bumpScoringRates(rates, game);
  }
  return samples;
}

function fitCalibrationFromGames(games) {
  const samples = collectAtsSamples(games);
  const map = fitReliabilityMap(samples);
  setActiveMap(map);
  return map;
}

function sliceBrierStats(obs) {
  const seen = new Set();
  const rawPairs = [];
  const calPairs = [];
  for (const o of obs || []) {
    const gameId = o.game && o.game.game_id;
    if (!gameId || seen.has(gameId)) continue;
    seen.add(gameId);
    const grade = o.expectedGrade;
    if (!grade || (grade.atsHit !== 'W' && grade.atsHit !== 'L')) continue;
    const y = grade.atsHit === 'W' ? 1 : 0;
    const pick = o.pick || {};
    const raw = pick.rawConfidence != null ? Number(pick.rawConfidence) : null;
    const cal = pick.confidence != null ? Number(pick.confidence) : null;
    if (Number.isFinite(raw)) rawPairs.push({ p: raw / 100, y });
    if (Number.isFinite(cal)) calPairs.push({ p: cal / 100, y });
  }
  return {
    target: CALIBRATION_TARGET,
    n: calPairs.length,
    brierRaw: round4(brierScore(rawPairs)),
    brierCalibrated: round4(brierScore(calPairs))
  };
}

module.exports = {
  CALIBRATION_TARGET,
  CALIBRATION_NOTE,
  PRIOR_STRENGTH,
  DISPLAY_MIN,
  DISPLAY_MAX,
  brierScore,
  pavaNonDecreasing,
  shrunkRate,
  fitReliabilityMap,
  interpolateP,
  displayConfidence,
  getActiveMap,
  setActiveMap,
  resetCalibration,
  bumpScoringRates,
  collectAtsSamples,
  fitCalibrationFromGames,
  sliceBrierStats
};
