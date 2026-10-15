'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSchemaSql, splitSqlStatements } = require('../src/schema');
const { buildBatchUpsert, UPSERT_SQL, defaultSeasons, loadSeedGames } = require('../src/nfl-data');

test('schema SQL is bundled and splits into statements', () => {
  const text = loadSchemaSql();
  assert.match(text, /CREATE TABLE IF NOT EXISTS games/);
  assert.match(text, /CREATE TABLE IF NOT EXISTS wagers/);
  assert.match(text, /CREATE TABLE IF NOT EXISTS ai_picks/);
  assert.match(text, /google_sub/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS email/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS spread_open NUMERIC/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS frozen_at/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS home_qb_name/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS total_open NUMERIC/);
  const stmts = splitSqlStatements(text);
  assert.ok(stmts.length >= 8);
});

test('batch upsert keeps COALESCE for scores and lines', () => {
  const batch = [
    {
      game_id: 'a',
      season: 2026,
      week: 1,
      game_type: 'REG',
      kickoff: '2026-09-10T00:00:00-04:00',
      gameday: '2026-09-10',
      weekday: 'Thursday',
      gametime: '20:20',
      home_team: 'SEA',
      away_team: 'NE',
      home_score: 13,
      away_score: 10,
      spread_line: 3,
      total_line: 44.5,
      home_rest: 7,
      away_rest: 7,
      roof: 'outdoors',
      surface: 'grass',
      temp: 70,
      wind: 5,
      location: 'Home',
      overtime: 0
    }
  ];
  const { text, params } = buildBatchUpsert(batch);
  assert.match(text, /home_score = COALESCE\(EXCLUDED\.home_score, games\.home_score\)/);
  assert.match(text, /spread_line = COALESCE\(EXCLUDED\.spread_line, games\.spread_line\)/);
  assert.match(text, /spread_open = COALESCE\(games\.spread_open, EXCLUDED\.spread_open, EXCLUDED\.spread_line\)/);
  assert.match(UPSERT_SQL, /total_line = COALESCE\(EXCLUDED\.total_line, games\.total_line\)/);
  assert.match(UPSERT_SQL, /total_open = COALESCE\(games\.total_open, EXCLUDED\.total_open, EXCLUDED\.total_line\)/);
  assert.equal(params[0], 'a');
  assert.equal(params.length, 24);
});

test('bundled seed covers 2016 through current', () => {
  const seasons = defaultSeasons(new Date('2026-09-16T00:00:00Z'));
  assert.equal(seasons[0], 2016);
  assert.equal(seasons[seasons.length - 1], 2026);
  assert.deepEqual(seasons, [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  const games = loadSeedGames();
  const found = new Set(games.map((g) => g.season));
  for (const year of [2016, 2020, 2023, 2026]) assert.equal(found.has(year), true);
  assert.ok(games.length > 2500);
});

test('maybeGradeImported runs gradeAll unless disabled', async () => {
  const { maybeGradeImported } = require('../src/nfl-data');
  let called = 0;
  const sql = { ok: true };
  const graded = await maybeGradeImported(sql, {
    gradeAllFn: async (client) => {
      called += 1;
      assert.equal(client, sql);
      return { ok: true, graded: 4 };
    }
  });
  assert.equal(called, 1);
  assert.equal(graded.graded, 4);
  const skipped = await maybeGradeImported(sql, {
    grade: false,
    gradeAllFn: async () => {
      throw new Error('should not grade');
    }
  });
  assert.equal(skipped, null);
  assert.equal(await maybeGradeImported(null, { gradeAllFn: async () => ({ ok: true }) }), null);
});
