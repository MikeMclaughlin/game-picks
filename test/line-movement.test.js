'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveOpening,
  sinceOpenLabel,
  spreadMovement,
  totalMovement,
  formatSpreadFavorite,
  enrichGame
} = require('../src/week-view');
const { UPSERT_SQL, UPSERT_CONFLICT, buildBatchUpsert } = require('../src/nfl-data');
const { BUILD } = require('../src/build');
const { loadSchemaSql } = require('../src/schema');

test('version is major.minor', () => {
  assert.equal(BUILD, '1.16');
  assert.match(String(BUILD), /^\d+\.\d+$/);
});

test('resolveOpening keeps the first stored open and takes first current when empty', () => {
  assert.equal(resolveOpening(-3.5, -2.5), -3.5);
  assert.equal(resolveOpening(null, 47.5), 47.5);
  assert.equal(resolveOpening('', 46), 46);
  assert.equal(resolveOpening(undefined, null), null);
});

test('formatSpreadFavorite uses home-favored convention', () => {
  assert.equal(formatSpreadFavorite(3.5, 'KC', 'BUF'), 'KC -3.5');
  assert.equal(formatSpreadFavorite(-1.5, 'SF', 'LAR'), 'LAR -1.5');
  assert.equal(formatSpreadFavorite(0, 'PHI', 'DAL'), 'PICK');
});

test('spread movement reports toward-dog as green and toward-fav as red', () => {
  const towardDog = spreadMovement({
    home_team: 'KC',
    away_team: 'BUF',
    spread_line: 2.5,
    spread_open: 3.5,
    spread_open_at: '2026-09-16T00:00:00Z'
  }, new Date('2026-09-19T00:00:00Z'));
  assert.equal(towardDog.moved, true);
  assert.equal(towardDog.toward, 'BUF');
  assert.equal(towardDog.openLabel, 'KC -3.5');
  assert.equal(towardDog.deltaLabel, '▲ 1.0 toward BUF');
  assert.equal(towardDog.tone, 'up');
  assert.equal(towardDog.sinceLabel, 'since 3 days ago');

  const towardFav = spreadMovement({
    home_team: 'DET',
    away_team: 'GB',
    spread_line: 3.5,
    spread_open: 2.5,
    spread_open_at: '2026-09-17T00:00:00Z'
  }, new Date('2026-09-19T00:00:00Z'));
  assert.equal(towardFav.toward, 'DET');
  assert.equal(towardFav.tone, 'down');
  assert.equal(towardFav.sinceLabel, 'since 2 days ago');
});

test('total movement colors Over red and Under green', () => {
  const over = totalMovement({
    total_line: 47.5,
    total_open: 46.5,
    total_open_at: '2026-09-16T12:00:00Z'
  }, new Date('2026-09-19T12:00:00Z'));
  assert.equal(over.moved, true);
  assert.equal(over.toward, 'Over');
  assert.equal(over.openLabel, '46.5');
  assert.equal(over.deltaLabel, '▲ 1.0 toward Over');
  assert.equal(over.tone, 'down');
  assert.equal(over.sinceLabel, 'since 3 days ago');

  const under = totalMovement({
    total_line: 51,
    total_open: 52.5,
    total_open_at: '2026-09-15T00:00:00Z'
  }, new Date('2026-09-19T00:00:00Z'));
  assert.equal(under.toward, 'Under');
  assert.equal(under.deltaLabel, '▼ 1.5 toward Under');
  assert.equal(under.tone, 'up');
});

test('flat markets hide since-open and say flat', () => {
  const spread = spreadMovement({
    home_team: 'PHI',
    away_team: 'DAL',
    spread_line: 3,
    spread_open: 3,
    spread_open_at: '2026-09-15T00:00:00Z'
  }, new Date('2026-09-19T00:00:00Z'));
  assert.equal(spread.moved, false);
  assert.equal(spread.deltaLabel, 'flat');
  assert.equal(spread.sinceLabel, null);

  const total = totalMovement({
    total_line: 44,
    total_open: 44,
    total_open_at: '2026-09-15T00:00:00Z'
  });
  assert.equal(total.moved, false);
  assert.equal(total.sinceLabel, null);
});

test('missing opening falls back to the current line (flat)', () => {
  const move = spreadMovement({
    home_team: 'SEA',
    away_team: 'NE',
    spread_line: 3
  });
  assert.equal(move.open, 3);
  assert.equal(move.moved, false);
  assert.equal(move.openLabel, 'SEA -3');
});

test('sinceOpenLabel uses day/hour/minute buckets', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  assert.equal(sinceOpenLabel('2026-09-18T12:00:00Z', now), 'since 1 day ago');
  assert.equal(sinceOpenLabel('2026-09-19T10:00:00Z', now), 'since 2 hours ago');
  assert.equal(sinceOpenLabel('2026-09-19T11:45:00Z', now), 'since 15 minutes ago');
  assert.equal(sinceOpenLabel('2026-09-19T11:59:30Z', now), 'since just now');
  assert.equal(sinceOpenLabel(null, now), null);
});

test('enrichGame exposes live lines plus open/delta payloads', () => {
  const card = enrichGame({
    game_id: '2026_03_BUF_KC',
    season: 2026,
    week: 3,
    game_type: 'REG',
    kickoff: '2026-09-20T17:00:00Z',
    weekday: 'Sunday',
    home_team: 'KC',
    away_team: 'BUF',
    spread_line: -2.5,
    spread_open: -3.5,
    spread_open_at: '2026-09-16T00:00:00Z',
    total_line: 47.5,
    total_open: 46.5,
    total_open_at: '2026-09-16T00:00:00Z',
    home_rest: 7,
    away_rest: 7
  }, []);
  assert.equal(card.spread_line, -2.5);
  assert.equal(card.spread_open, -3.5);
  assert.equal(card.spreadMove.moved, true);
  assert.equal(card.spreadMove.toward, 'KC');
  assert.equal(card.totalMove.moved, true);
  assert.equal(card.totalMove.toward, 'Over');
});

test('upsert SQL updates current lines and never overwrites a stored opening', () => {
  assert.match(UPSERT_SQL, /spread_line = COALESCE\(EXCLUDED\.spread_line, games\.spread_line\)/);
  assert.match(UPSERT_SQL, /spread_open = COALESCE\(games\.spread_open, EXCLUDED\.spread_open, EXCLUDED\.spread_line\)/);
  assert.match(UPSERT_SQL, /total_open = COALESCE\(games\.total_open, EXCLUDED\.total_open, EXCLUDED\.total_line\)/);
  assert.match(UPSERT_CONFLICT, /WHEN games\.spread_open IS NOT NULL THEN games\.spread_open_at/);
  const batch = [{
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
    home_score: null,
    away_score: null,
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
  }];
  const { text, params } = buildBatchUpsert(batch);
  assert.match(text, /spread_open, total_open, spread_open_at, total_open_at, updated_at/);
  assert.match(text, /COALESCE\(games\.spread_open/);
  assert.match(text, /\$13::numeric/);
  assert.match(text, /\$14::numeric/);
  assert.match(text, /CASE WHEN \$13::numeric IS NULL THEN NULL::timestamptz ELSE now\(\) END/);
  assert.match(text, /CASE WHEN \$14::numeric IS NULL THEN NULL::timestamptz ELSE now\(\) END/);
  assert.doesNotMatch(text, /CASE WHEN \$13 IS NULL/);
  assert.match(UPSERT_SQL, /\$13::numeric/);
  assert.match(UPSERT_SQL, /CASE WHEN \$13::numeric IS NULL THEN NULL::timestamptz/);
  assert.equal(params.length, 24);
  assert.equal(params[12], 3);
  assert.equal(params[13], 44.5);
});

test('batch upsert casts reused line params so null spreads still type as numeric', () => {
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
      home_score: null,
      away_score: null,
      spread_line: null,
      total_line: null,
      home_rest: 7,
      away_rest: 7,
      roof: 'outdoors',
      surface: 'grass',
      temp: null,
      wind: null,
      location: 'Home',
      overtime: null
    },
    {
      game_id: 'b',
      season: 2026,
      week: 2,
      game_type: 'REG',
      kickoff: '2026-09-13T13:00:00-04:00',
      gameday: '2026-09-13',
      weekday: 'Sunday',
      gametime: '13:00',
      home_team: 'KC',
      away_team: 'BUF',
      home_score: null,
      away_score: null,
      spread_line: -3.5,
      total_line: 47.5,
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
  assert.match(text, /\$13::numeric/);
  assert.match(text, /\$37::numeric/);
  assert.match(text, /CASE WHEN \$37::numeric IS NULL THEN NULL::timestamptz ELSE now\(\) END/);
  assert.equal(params.length, 48);
  assert.equal(params[12], null);
  assert.equal(params[13], null);
  assert.equal(params[36], -3.5);
  assert.equal(params[37], 47.5);
});

test('schema persists opening columns and backfills existing rows', () => {
  const text = loadSchemaSql();
  assert.match(text, /spread_open NUMERIC/);
  assert.match(text, /total_open NUMERIC/);
  assert.match(text, /spread_open_at TIMESTAMPTZ/);
  assert.match(text, /ADD COLUMN IF NOT EXISTS spread_open NUMERIC/);
  assert.match(text, /SET\s+spread_open = spread_line/);
  assert.match(text, /WHERE spread_open IS NULL AND spread_line IS NOT NULL/);
});
