'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gradeOutright, gradeAts, gradeOu, validatePick, isLocked } = require('../src/grader');

const game = {
  home_team: 'SEA',
  away_team: 'NE',
  home_score: 13,
  away_score: 10,
  spread_line: 3,
  total_line: 44.5,
  kickoff: '2026-09-09T20:20:00-04:00'
};

test('outright winner gets 1, loser 0, tie 0', () => {
  assert.deepEqual(gradeOutright(game, 'SEA'), { result: 'win', points: 1 });
  assert.deepEqual(gradeOutright(game, 'NE'), { result: 'loss', points: 0 });
  assert.deepEqual(
    gradeOutright({ ...game, home_score: 17, away_score: 17 }, 'SEA'),
    { result: 'push', points: 0 }
  );
});

test('ATS home covers if margin > spread_line', () => {
  // margin 3, spread 3 => push
  assert.deepEqual(gradeAts(game, 'SEA'), { result: 'push', points: 0 });
  assert.deepEqual(gradeAts(game, 'NE'), { result: 'push', points: 0 });
  const cover = { ...game, home_score: 20, away_score: 10 }; // margin 10 > 3
  assert.deepEqual(gradeAts(cover, 'SEA'), { result: 'win', points: 1 });
  assert.deepEqual(gradeAts(cover, 'NE'), { result: 'loss', points: 0 });
  const awayCover = { ...game, home_score: 10, away_score: 14 }; // margin -4 < 3
  assert.deepEqual(gradeAts(awayCover, 'NE'), { result: 'win', points: 1 });
});

test('O/U over/under/push', () => {
  // total 23 vs 44.5 under
  assert.deepEqual(gradeOu(game, 'under'), { result: 'win', points: 1 });
  assert.deepEqual(gradeOu(game, 'over'), { result: 'loss', points: 0 });
  assert.deepEqual(gradeOu({ ...game, home_score: 22, away_score: 23, total_line: 45 }, 'over'), {
    result: 'push',
    points: 0
  });
});

test('reject picks after kickoff', () => {
  const locked = { ...game, kickoff: '2000-01-01T00:00:00Z' };
  assert.equal(isLocked(locked, Date.parse('2026-09-16T00:00:00Z')), true);
  assert.throws(() => validatePick(locked, 'outright', 'SEA', Date.parse('2026-09-16T00:00:00Z')), /kickoff/i);
});

test('validate markets against posted lines', () => {
  const future = { ...game, kickoff: '2099-01-01T00:00:00Z' };
  const outright = validatePick(future, 'outright', 'sea', Date.parse('2026-01-01Z'));
  assert.equal(outright.selection, 'SEA');
  const ats = validatePick(future, 'ats', 'NE', Date.parse('2026-01-01Z'));
  assert.equal(ats.selection, 'NE');
  const ou = validatePick(future, 'ou', 'OVER', Date.parse('2026-01-01Z'));
  assert.equal(ou.selection, 'over');
  assert.throws(() => validatePick({ ...future, total_line: null }, 'ou', 'over'), /total/i);
  assert.throws(() => validatePick({ ...future, spread_line: null }, 'ats', 'SEA'), /spread/i);
});
