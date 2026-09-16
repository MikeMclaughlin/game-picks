'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSchemaSql, splitSqlStatements } = require('../src/schema');
const { buildBatchUpsert, UPSERT_SQL, defaultSeasons, loadSeedGames } = require('../src/nfl-data');

test('schema SQL is bundled and splits into statements', () => {
  const text = loadSchemaSql();
  assert.match(text, /CREATE TABLE IF NOT EXISTS games/);
  assert.match(text, /CREATE TABLE IF NOT EXISTS wagers/);
  assert.match(text, /clerk_user_id/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS clerk_user_id/);
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
  assert.match(UPSERT_SQL, /total_line = COALESCE\(EXCLUDED\.total_line, games\.total_line\)/);
  assert.equal(params[0], 'a');
  assert.equal(params.length, 22);
});

test('bundled seed covers last three seasons plus current', () => {
  const seasons = defaultSeasons(new Date('2026-09-16T00:00:00Z'));
  assert.deepEqual(seasons, [2023, 2024, 2025, 2026]);
  const games = loadSeedGames();
  const found = new Set(games.map((g) => g.season));
  for (const year of [2023, 2024, 2025, 2026]) assert.equal(found.has(year), true);
  assert.ok(games.length > 800);
});
