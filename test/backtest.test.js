'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseBacktestFilters,
  parseChain,
  spreadAbsBucket,
  totalBucket,
  streakBucket,
  backtestPayload,
  backtestCsv,
  SMALL_N
} = require('../src/backtest');

function game(overrides = {}) {
  return {
    game_id: overrides.game_id || 'g1',
    season: 2024,
    week: 1,
    game_type: 'REG',
    kickoff: '2024-09-08T17:00:00Z',
    home_team: 'BUF',
    away_team: 'MIA',
    home_score: 21,
    away_score: 14,
    spread_line: 3,
    total_line: 44,
    home_rest: 7,
    away_rest: 7,
    roof: 'outdoors',
    temp: 70,
    wind: 5,
    location: 'Home',
    ...overrides
  };
}

test('parseChain accepts csv and objects', () => {
  const a = parseChain('last5ats:hot,rest:short,site:home,role:dog');
  assert.deepEqual(a.map((s) => s.dim), ['last5ats', 'rest', 'site', 'role']);
  assert.equal(a[3].value, 'underdog');
  const b = parseChain([{ dim: 'lastGame', value: 'win' }, { dim: 'division', value: 'div' }]);
  assert.equal(b[0].value, 'W');
  assert.equal(b[1].value, 'divisional');
  assert.equal(parseChain('').length, 0);
});

test('spread/total/streak buckets', () => {
  assert.equal(spreadAbsBucket(game({ spread_line: 0 })), 'pick');
  assert.equal(spreadAbsBucket(game({ spread_line: 2.5 })), 'small');
  assert.equal(spreadAbsBucket(game({ spread_line: -6.5 })), 'medium');
  assert.equal(spreadAbsBucket(game({ spread_line: 7 })), 'large');
  assert.equal(totalBucket(game({ total_line: 41 })), 'low');
  assert.equal(totalBucket(game({ total_line: 45 })), 'mid');
  assert.equal(totalBucket(game({ total_line: 48 })), 'high');
  assert.equal(streakBucket('C-C-C-C-F'), 'hot');
  assert.equal(streakBucket('W-L-W-L-W'), 'mixed');
  assert.equal(streakBucket('L-L-W-L-L'), 'cold');
  assert.equal(streakBucket('W-W'), 'short');
});

test('backtestPayload reports N, small-N flag, lift, expected calls, and CSV', () => {
  const games = [
    game({
      game_id: 'a',
      kickoff: '2024-09-08T17:00:00Z',
      home_team: 'BUF',
      away_team: 'MIA',
      home_score: 24,
      away_score: 10,
      spread_line: 3,
      total_line: 41
    }),
    game({
      game_id: 'b',
      kickoff: '2024-09-15T17:00:00Z',
      week: 2,
      home_team: 'NE',
      away_team: 'BUF',
      home_score: 17,
      away_score: 20,
      spread_line: 1,
      total_line: 42,
      home_rest: 7,
      away_rest: 7
    }),
    game({
      game_id: 'c',
      kickoff: '2024-09-22T17:00:00Z',
      week: 3,
      home_team: 'BUF',
      away_team: 'NYJ',
      home_score: 14,
      away_score: 21,
      spread_line: 6,
      total_line: 49,
      home_rest: 7,
      away_rest: 4
    })
  ];
  const payload = backtestPayload(games, {
    filters: parseBacktestFilters({ team: 'BUF', from: 2024, to: 2024 })
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.smallNThreshold, SMALL_N);
  assert.equal(payload.n, 3);
  assert.equal(payload.smallN, true);
  assert.equal(payload.slice.outright.wins, 2);
  assert.equal(payload.slice.outright.losses, 1);
  assert.ok(payload.vsLeague);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.vsLeague.ats, 'liftPts'), true);
  assert.ok(Array.isArray(payload.games));
  assert.equal(payload.games.length, 3);
  const row = payload.games.find((g) => g.game_id === 'c');
  assert.ok(row.expected);
  assert.match(row.expected, / and /);
  assert.equal(row.gameDate, '09/22/2024 13:00 EST');
  assert.equal(typeof row.confidence, 'number');
  assert.ok(row.confidence >= 1 && row.confidence <= 99);
  assert.ok(row.rawConfidence >= 51 && row.rawConfidence <= 92);
  assert.equal(payload.expected.calibrationTarget, 'ats');
  assert.ok(payload.expected.brierRaw == null || typeof payload.expected.brierRaw === 'number');
  assert.ok(payload.expected.brierCalibrated == null || typeof payload.expected.brierCalibrated === 'number');
  assert.match(payload.notes.confidence, /calibrated historical ATS hit rate/i);
  assert.ok(['W', 'L', 'P', null].includes(row.expectedAtsHit) || row.expectedAtsHit == null);
  const csv = backtestCsv(payload);
  assert.match(csv, /date,season,week,away,home/);
  assert.match(csv, /expected,confidence/);
  assert.doesNotMatch(csv, /expected_joint/);
  assert.match(csv, /09\/08\/2024 13:00 EST/);
  assert.match(csv, /BUF/);
  assert.equal(row.matchup, 'NYJ @ BUF');
  assert.equal(row.opponent, 'NYJ @ BUF');
});

test('chain last-game win shrinks the slice versus the year baseline', () => {
  const games = [
    game({ game_id: '1', kickoff: '2024-09-08T17:00:00Z', home_score: 28, away_score: 10 }),
    game({
      game_id: '2',
      kickoff: '2024-09-15T17:00:00Z',
      week: 2,
      home_team: 'BUF',
      away_team: 'NE',
      home_score: 21,
      away_score: 20,
      spread_line: 3
    }),
    game({
      game_id: '3',
      kickoff: '2024-09-22T17:00:00Z',
      week: 3,
      home_team: 'MIA',
      away_team: 'BUF',
      home_score: 10,
      away_score: 17,
      spread_line: -3
    })
  ];
  const all = backtestPayload(games, {
    filters: parseBacktestFilters({ team: 'BUF', from: 2024, to: 2024 }),
    chain: []
  });
  const chained = backtestPayload(games, {
    filters: parseBacktestFilters({ team: 'BUF', from: 2024, to: 2024 }),
    chain: 'lastGame:W'
  });
  assert.ok(chained.n < all.n);
  assert.ok(chained.n >= 1);
  const lastStep = chained.path[chained.path.length - 1];
  assert.equal(lastStep.dim, 'lastGame');
  assert.equal(lastStep.value, 'W');
  assert.equal(lastStep.n, chained.n);
});

test('matching rows keep filter fields even when a value is n/a', () => {
  const rows = backtestPayload([
    game({
      game_id: 'home',
      home_team: 'BUF',
      away_team: 'MIA',
      kickoff: '2024-09-08T17:00:00Z'
    })
  ], {
    filters: parseBacktestFilters({ team: 'BUF', from: 2024, to: 2024, site: 'home', timeOfDay: 'early' })
  }).games;
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.team, 'BUF');
  assert.equal(row.site, 'home');
  assert.equal(row.timeOfDay, 'early');
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'travel'), true);
  assert.equal(row.travel, 'none');
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'spreadBucket'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'totalBucket'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'restBucket'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'roofLabel'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'distanceLabel'), true);
});

test('parseBacktestFilters adds spread and total buckets', () => {
  const f = parseBacktestFilters({ team: 'SEA', spread: 'large', total: 'high', from: 2016, to: 2024 });
  assert.equal(f.spread, 'large');
  assert.equal(f.total, 'high');
  assert.equal(f.team, 'SEA');
});

test('starter out filter and chain use the nflverse injury index', () => {
  const injuryIndex = {
    seasons: new Set([2024]),
    qbOut: new Set(['2024|REG|1|MIA'])
  };
  const games = [
    game({ game_id: 'out', week: 1, home_team: 'BUF', away_team: 'MIA' }),
    game({
      game_id: 'active',
      week: 2,
      kickoff: '2024-09-15T17:00:00Z',
      home_team: 'BUF',
      away_team: 'NE'
    })
  ];
  const filters = parseBacktestFilters({ from: 2024, to: 2024, starterOut: 'yes' });
  assert.equal(filters.starterOut, 'out');
  const sliced = backtestPayload(games, { filters, injuryIndex });
  assert.equal(sliced.n, 1);
  assert.equal(sliced.games[0].team, 'MIA');
  assert.equal(sliced.games[0].starterOut, 'out');
  const csv = backtestCsv(sliced);
  assert.match(csv, /starter_out/);
  assert.match(csv, /,out\n/);

  const chained = backtestPayload(games, {
    filters: parseBacktestFilters({ team: 'BUF', from: 2024, to: 2024 }),
    chain: parseChain('starterOut:active'),
    injuryIndex
  });
  assert.equal(chained.n, 2);
  assert.ok(chained.games.every((row) => row.starterOut === 'active'));

  const missing = backtestPayload(games, {
    filters: parseBacktestFilters({ from: 2024, to: 2024, starterOut: 'out' })
  });
  assert.equal(missing.n, 0);
});
