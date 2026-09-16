'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { impliedPoints, projectGame, formatAtsPick, currentSeasonWeek } = require('../src/week-view');
const { roadTravel } = require('../src/teams');
const { UPSERT_SQL } = require('../src/nfl-data');

test('implied points from (total ± spread) / 2', () => {
  const imp = impliedPoints(3, 44.5);
  assert.equal(imp.home, 23.75);
  assert.equal(imp.away, 20.75);
});

test('ATS display line uses home-favored spread_line', () => {
  const game = { home_team: 'SEA', away_team: 'NE', spread_line: 3 };
  assert.equal(formatAtsPick('SEA', game), 'SEA -3');
  assert.equal(formatAtsPick('NE', game), 'NE +3');
});

test('no history fades totals >= 46 toward under', () => {
  const proj = projectGame({ home_team: 'SEA', away_team: 'NE', total_line: 46, spread_line: 3 }, []);
  assert.equal(proj.hasHistory, false);
  assert.equal(proj.fadeHighTotal, true);
  assert.equal(proj.ou, 'under');
});

test('road travel only when crossing more than one time zone', () => {
  assert.equal(roadTravel('DET', 'BUF'), null);
  const seaBuf = roadTravel('SEA', 'BUF');
  assert.equal(seaBuf.dir, 'east');
  assert.equal(seaBuf.zones, 3);
  assert.equal(seaBuf.label, 'east +3tz');
  const phiSea = roadTravel('PHI', 'SEA');
  assert.equal(phiSea.dir, 'west');
  assert.equal(phiSea.zones, 3);
});

test('upsert SQL coalesces scores and lines', () => {
  assert.match(UPSERT_SQL, /home_score = COALESCE\(EXCLUDED\.home_score, games\.home_score\)/);
  assert.match(UPSERT_SQL, /away_score = COALESCE\(EXCLUDED\.away_score, games\.away_score\)/);
  assert.match(UPSERT_SQL, /spread_line = COALESCE\(EXCLUDED\.spread_line, games\.spread_line\)/);
  assert.match(UPSERT_SQL, /total_line = COALESCE\(EXCLUDED\.total_line, games\.total_line\)/);
});

test('current week prefers upcoming kickoff', () => {
  const games = [
    { season: 2026, week: 1, kickoff: '2026-09-10T00:00:00Z' },
    { season: 2026, week: 2, kickoff: '2026-09-18T00:00:00Z' }
  ];
  const cur = currentSeasonWeek(games, new Date('2026-09-16T12:00:00Z'));
  assert.deepEqual(cur, { season: 2026, week: 2 });
});
