'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin, bearerToken } = require('../src/http-util');
const { persistAiPicks, pickPayload } = require('../src/ai-picks');
const { HISTORY_FROM_SEASON, defaultSeasons, historyWindow } = require('../src/seasons');

test('requireAdmin allows CRON_SECRET bearer when ADMIN_KEY is set', () => {
  const prevAdmin = process.env.ADMIN_KEY;
  const prevCron = process.env.CRON_SECRET;
  process.env.ADMIN_KEY = 'admin-secret';
  process.env.CRON_SECRET = 'cron-secret';
  try {
    const url = new URL('http://localhost/api/cron/scores');
    assert.equal(requireAdmin({ headers: { 'x-admin-key': 'admin-secret' } }, url), true);
    assert.equal(requireAdmin({ headers: { authorization: 'Bearer cron-secret' } }, url), true);
    assert.equal(requireAdmin({ headers: { authorization: 'Bearer admin-secret' } }, url), true);
    assert.throws(
      () => requireAdmin({ headers: {} }, url),
      /Admin key required/
    );
  } finally {
    if (prevAdmin == null) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = prevAdmin;
    if (prevCron == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  }
});

test('requireAdmin is open when ADMIN_KEY is unset', () => {
  const prevAdmin = process.env.ADMIN_KEY;
  delete process.env.ADMIN_KEY;
  try {
    assert.equal(requireAdmin({ headers: {} }, new URL('http://localhost/api/grade-all')), true);
    assert.equal(bearerToken({ headers: { authorization: 'Bearer abc' } }), 'abc');
  } finally {
    if (prevAdmin == null) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = prevAdmin;
  }
});

test('persistAiPicks no-ops without sql and pickPayload keeps served AI fields', async () => {
  const none = await persistAiPicks(null, [{ game_id: 'g', aiPick: { label: 'SEA -3' } }]);
  assert.equal(none.saved, 0);
  const payload = pickPayload({
    home_team: 'SEA',
    away_team: 'NE',
    spread_line: 3,
    total_line: 44.5,
    aiPick: { ats: 'SEA -3', ou: 'under', ouText: 'take the under 44.5', label: 'SEA -3 · take the under 44.5' }
  });
  assert.equal(payload.ats, 'SEA -3');
  assert.equal(payload.ou, 'under');
  assert.equal(payload.label, 'SEA -3 · take the under 44.5');
});

test('history window starts at 2016', () => {
  assert.equal(HISTORY_FROM_SEASON, 2016);
  const seasons = defaultSeasons(new Date('2026-09-16T00:00:00Z'));
  assert.equal(seasons[0], 2016);
  const games = [
    { season: 2015, game_id: 'old' },
    { season: 2016, game_id: 'keep' },
    { season: 2026, game_id: 'now' },
    { season: 2027, game_id: 'future' }
  ];
  const windowed = historyWindow(games, 2026);
  assert.deepEqual(windowed.map((g) => g.game_id), ['keep', 'now']);
});
