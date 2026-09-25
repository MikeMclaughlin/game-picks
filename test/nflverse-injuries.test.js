'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  injuryReleaseUrl,
  cacheIsFresh,
  qbOutKeysFromRows,
  starterOutState,
  loadStarterOutIndex,
  resetInjuryCache,
  CURRENT_SEASON_TTL_MS,
  META_KEY
} = require('../src/nflverse-injuries');

const CSV = [
  'season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified',
  '2024,REG,MIA,1,00-1,QB,Tua Tagovailoa,Tua,Tagovailoa,Concussion,,Out,,,Did Not Participate In Practice,2024-09-06T00:00:00Z',
  '2024,REG,BUF,1,00-2,WR,Khalil Shakir,Khalil,Shakir,Ankle,,Out,,,,2024-09-06T00:00:00Z',
  '2024,REG,BUF,1,00-3,QB,Josh Allen,Josh,Allen,Hand,,Questionable,,,,2024-09-06T00:00:00Z',
  '2024,REG,LA,2,00-4,QB,Matthew Stafford,Matthew,Stafford,Hip,,Out,,,,2024-09-13T00:00:00Z',
  '2024,REG,DAL,3,00-5,QB,Dak Prescott,Dak,Prescott,,,,,Knee,,Did Not Participate In Practice,2024-09-20T00:00:00Z'
].join('\n');

function rowsFrom(text) {
  const { parseCsv } = require('../src/nfl-data');
  return parseCsv(text);
}

test('starter out is a QB with official weekly report_status Out', () => {
  assert.match(injuryReleaseUrl(2024), /injuries_2024\.csv$/);
  const keys = qbOutKeysFromRows(rowsFrom(CSV));
  assert.deepEqual(keys.sort(), ['REG|1|MIA', 'REG|2|LAR']);
  const index = {
    seasons: new Set([2024]),
    qbOut: new Set(keys.map((key) => `2024|${key}`))
  };
  const mia = { season: 2024, week: 1, game_type: 'REG', away_team: 'MIA', home_team: 'BUF' };
  assert.equal(starterOutState(mia, 'MIA', index), 'out');
  assert.equal(starterOutState(mia, 'BUF', index), 'active');
  assert.equal(starterOutState({ season: 2023, week: 1, game_type: 'REG' }, 'MIA', index), 'unknown');
  assert.equal(starterOutState(mia, 'MIA', null), 'unknown');
});

test('past-season injury cache is reused and the current season refreshes', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  assert.equal(cacheIsFresh({ fetchedAt: '2020-01-01T00:00:00Z', keys: [] }, 2024, now), true);
  assert.equal(cacheIsFresh({
    fetchedAt: new Date(now.getTime() - CURRENT_SEASON_TTL_MS - 1000).toISOString(),
    keys: []
  }, 2026, now), false);
  assert.equal(cacheIsFresh({
    fetchedAt: new Date(now.getTime() - 60 * 1000).toISOString(),
    keys: ['REG|1|MIA']
  }, 2026, now), true);
});

test('loadStarterOutIndex fetches once, then uses disk and app_meta', async () => {
  resetInjuryCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfl-inj-'));
  const now = new Date('2026-09-25T12:00:00Z');
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, text: async () => CSV };
  };
  const first = await loadStarterOutIndex([2024], { cacheDir: dir, now, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(first.fetchedSeasons.length, 1);
  assert.equal(first.qbOut.has('2024|REG|1|MIA'), true);
  assert.equal(first.qbOut.has('2024|REG|2|LAR'), true);
  assert.equal(first.seasons.has(2024), true);

  resetInjuryCache();
  const second = await loadStarterOutIndex([2024], {
    cacheDir: dir,
    now,
    fetchImpl: async () => {
      throw new Error('should not refetch a cached season');
    }
  });
  assert.equal(second.fetchedSeasons.length, 0);
  assert.equal(second.qbOut.has('2024|REG|1|MIA'), true);

  const store = { value: null };
  const sql = async (strings, ...vals) => {
    const text = strings.join(' ');
    if (text.includes('SELECT')) return store.value ? [{ value: store.value }] : [];
    store.value = vals[1];
    return [];
  };
  resetInjuryCache();
  const metaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfl-inj-meta-'));
  await loadStarterOutIndex([2024], { cacheDir: metaDir, now, fetchImpl, sql });
  assert.match(String(store.value), /REG\|1\|MIA/);
  const saved = JSON.parse(store.value);
  assert.equal(saved.seasons['2024'].keys.includes('REG|1|MIA'), true);

  resetInjuryCache();
  const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfl-inj-meta2-'));
  const fromMeta = await loadStarterOutIndex([2024], {
    cacheDir: otherDir,
    now,
    sql,
    fetchImpl: async () => {
      throw new Error('should not refetch when app_meta is fresh');
    }
  });
  assert.equal(fromMeta.qbOut.has('2024|REG|2|LAR'), true);
  assert.equal(fs.existsSync(path.join(otherDir, '2024.json')), true);
  resetInjuryCache();
});
