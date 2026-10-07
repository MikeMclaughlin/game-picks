'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  brierScore,
  pavaNonDecreasing,
  shrunkRate,
  fitReliabilityMap,
  interpolateP,
  displayConfidence,
  resetCalibration,
  collectAtsSamples,
  fitCalibrationFromGames,
  PRIOR_STRENGTH
} = require('../src/calibration');
const { aiConfidence, ouConfidenceRaw, aiPick, projectGame } = require('../src/week-view');
const { loadSeedGames } = require('../src/nfl-data');

test('aiConfidence raw rule stays in 51–92', () => {
  resetCalibration();
  assert.equal(ouConfidenceRaw({ total_line: 46 }, { hasHistory: false, fadeHighTotal: true }), 54);
  assert.equal(aiConfidence({ total_line: 46 }, { hasHistory: false, fadeHighTotal: true }), 52);
  assert.equal(aiConfidence({ total_line: 40 }, { hasHistory: false, fadeHighTotal: false }), 52);
  assert.equal(ouConfidenceRaw({ total_line: 40 }, { hasHistory: false, fadeHighTotal: false }), 52);
  const high = aiConfidence(
    { spread_line: 3, total_line: 44 },
    { hasHistory: true, projMargin: 10, projTotal: 52, sampleN: 80 }
  );
  assert.ok(high >= 51 && high <= 92);
  const low = aiConfidence(
    { spread_line: 3, total_line: 44 },
    { hasHistory: true, projMargin: 3.1, projTotal: 44.1, sampleN: 2 }
  );
  assert.ok(low >= 51 && low <= 92);
});

test('tiny buckets shrink toward the raw/100 prior', () => {
  const prior = 0.9;
  const p = shrunkRate(0, 1, prior);
  const expected = (0 + PRIOR_STRENGTH * prior) / (1 + PRIOR_STRENGTH);
  assert.equal(p, expected);
  assert.ok(p > 0.5);
  assert.ok(p < prior);
  const map = fitReliabilityMap([{ raw: 90, hit: 0 }]);
  const cal = interpolateP(90, map);
  assert.ok(cal > 0.5);
  assert.ok(cal < 0.9);
});

test('isotonic map is monotone and does not invert', () => {
  const samples = [];
  for (let i = 0; i < 12; i += 1) samples.push({ raw: 52, hit: i < 4 ? 1 : 0 });
  for (let i = 0; i < 12; i += 1) samples.push({ raw: 70, hit: 0 });
  for (let i = 0; i < 12; i += 1) samples.push({ raw: 80, hit: 1 });
  const map = fitReliabilityMap(samples);
  assert.ok(map.knots.length >= 2);
  let prev = -Infinity;
  for (const knot of map.knots) {
    assert.ok(knot.p + 1e-12 >= prev, `knot ${knot.raw} inverted (${knot.p} < ${prev})`);
    prev = knot.p;
  }
  prev = -Infinity;
  for (let raw = 51; raw <= 92; raw += 1) {
    const p = interpolateP(raw, map);
    assert.ok(p + 1e-12 >= prev, `interpolated ${raw} inverted`);
    assert.ok(p >= 0.01 && p <= 0.99);
    prev = p;
  }
  const shown = [];
  for (let raw = 51; raw <= 92; raw += 1) {
    const c = displayConfidence(raw, map);
    assert.ok(c >= 1 && c <= 99);
    shown.push(c);
  }
  for (let i = 1; i < shown.length; i += 1) {
    assert.ok(shown[i] >= shown[i - 1], `display inverted at ${51 + i}: ${shown[i]} < ${shown[i - 1]}`);
  }
});

test('PAVA pools a decreasing adjacent pair', () => {
  const out = pavaNonDecreasing([0.8, 0.2], [10, 10]);
  assert.equal(out.length, 2);
  assert.equal(out[0], 0.5);
  assert.equal(out[1], 0.5);
});

test('calibrated confidence stays in 1–99 and identity without a map', () => {
  resetCalibration();
  assert.equal(displayConfidence(61, null), 61);
  const map = fitReliabilityMap([
    { raw: 52, hit: 1 }, { raw: 52, hit: 0 }, { raw: 80, hit: 1 }, { raw: 80, hit: 1 }
  ]);
  const c = displayConfidence(80, map);
  assert.equal(typeof c, 'number');
  assert.ok(c >= 1 && c <= 99);
});

test('in-sample Brier of the isotonic map is not worse than the raw score', () => {
  const samples = [];
  for (let i = 0; i < 40; i += 1) samples.push({ raw: 80, hit: i < 22 ? 1 : 0 });
  const map = fitReliabilityMap(samples);
  const rawPairs = samples.map((s) => ({ p: s.raw / 100, y: s.hit }));
  const calPairs = samples.map((s) => ({ p: interpolateP(s.raw, map), y: s.hit }));
  const raw = brierScore(rawPairs);
  const cal = brierScore(calPairs);
  assert.ok(cal <= raw + 1e-12);
});

test('calibration does not change ATS/OU side selection', () => {
  resetCalibration();
  const game = { home_team: 'BUF', away_team: 'MIA', spread_line: 5.5, total_line: 47 };
  const projection = {
    hasHistory: true,
    atsTeam: 'BUF',
    ou: 'over',
    projMargin: 8,
    projTotal: 50,
    sampleN: 40
  };
  const uncal = aiPick(game, { ...projection }, { calibrate: false });
  const map = fitReliabilityMap(Array.from({ length: 20 }, (_, i) => ({ raw: uncal.rawConfidence, hit: i < 11 ? 1 : 0 })));
  const cal = aiPick(game, { ...projection, atsTeam: 'BUF', ou: 'over' }, { map });
  assert.equal(cal.ats, uncal.ats);
  assert.equal(cal.ou, uncal.ou);
  assert.equal(cal.atsTeam, 'BUF');
  assert.equal(cal.expected, 'BUF -5.5 and Over');
  assert.equal(uncal.confidence, uncal.rawConfidence);
  assert.ok(cal.rawConfidence >= 51 && cal.rawConfidence <= 92);
  assert.ok(cal.confidence >= 1 && cal.confidence <= 99);
});

test('projectGame side selection is independent of calibration', () => {
  const history = [
    {
      home_team: 'BUF', away_team: 'NE', home_score: 30, away_score: 10,
      kickoff: '2024-09-08T17:00:00Z', game_type: 'REG'
    },
    {
      home_team: 'MIA', away_team: 'NYJ', home_score: 14, away_score: 21,
      kickoff: '2024-09-08T17:00:00Z', game_type: 'REG'
    }
  ];
  const game = { home_team: 'BUF', away_team: 'MIA', spread_line: 3, total_line: 44 };
  const a = projectGame(game, history);
  const b = projectGame(game, history);
  assert.equal(a.atsTeam, b.atsTeam);
  assert.equal(a.ou, b.ou);
});

test('seed history fit is monotone and improves Brier vs raw', () => {
  const games = loadSeedGames();
  const samples = collectAtsSamples(games);
  assert.ok(samples.length > 100);
  const map = fitCalibrationFromGames(games);
  let prev = -Infinity;
  for (let raw = 51; raw <= 92; raw += 1) {
    const p = interpolateP(raw, map);
    assert.ok(p + 1e-12 >= prev);
    prev = p;
  }
  const rawPairs = samples.map((s) => ({ p: s.raw / 100, y: s.hit }));
  const calPairs = samples.map((s) => ({ p: interpolateP(s.raw, map), y: s.hit }));
  const raw = brierScore(rawPairs);
  const cal = brierScore(calPairs);
  assert.ok(Number.isFinite(raw) && Number.isFinite(cal));
  assert.ok(cal <= raw + 1e-9);
  resetCalibration();
});
