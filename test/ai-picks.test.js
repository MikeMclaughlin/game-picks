'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin, bearerToken } = require('../src/http-util');
const { persistAiPicks, pickPayload, applyAiSnapshots, decidePersist, pickFromPayload } = require('../src/ai-picks');
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
    aiPick: { ats: 'SEA -3', ou: 'under', ouText: 'take the under 44.5', label: 'SEA -3 · take the under 44.5', expected: 'SEA -3 and Under', confidence: 61, atsTeam: 'SEA' }
  });
  assert.equal(payload.ats, 'SEA -3');
  assert.equal(payload.ou, 'under');
  assert.equal(payload.label, 'SEA -3 · take the under 44.5');
  assert.equal(payload.expected, 'SEA -3 and Under');
  assert.equal(payload.confidence, 61);
  assert.equal(payload.atsConfidence, 61);
});

test('locked games serve the stored snapshot and do not rewrite a frozen pick', () => {
  const fresh = {
    game_id: '2026_02_SEA_ARI',
    season: 2026,
    week: 2,
    locked: true,
    home_team: 'ARI',
    away_team: 'SEA',
    spread_line: -3.5,
    total_line: 40.5,
    aiPick: {
      ats: 'ARI +3.5',
      ou: 'over',
      label: 'ARI +3.5 · take the over 40.5',
      expected: 'ARI +3.5 and Over',
      confidence: 70,
      atsConfidence: 70,
      ouConfidence: 61,
      atsTeam: 'ARI',
      ouText: 'take the over 40.5'
    }
  };
  const stored = {
    ats: 'SEA -3.5',
    ou: 'under',
    ouText: 'take the under 40.5',
    label: 'SEA -3.5 · take the under 40.5',
    expected: 'SEA -3.5 and Under',
    confidence: 58,
    atsConfidence: 58,
    ouConfidence: 54,
    atsTeam: 'SEA'
  };
  const frozen = applyAiSnapshots([fresh], [{
    game_id: fresh.game_id,
    frozen_at: '2026-09-20T20:25:00Z',
    payload: stored
  }]);
  assert.equal(frozen[0].aiPick.ats, 'SEA -3.5');
  assert.equal(frozen[0].aiPick.ou, 'under');
  assert.equal(frozen[0].aiPick.atsConfidence, 58);
  assert.equal(frozen[0].aiPick.ouConfidence, 54);
  assert.equal(frozen[0].aiPickFrozen, true);
  assert.equal(decidePersist(frozen[0]).action, 'skip');

  const pregameRow = applyAiSnapshots([fresh], [{
    game_id: fresh.game_id,
    frozen_at: null,
    payload: stored
  }]);
  assert.equal(pregameRow[0].aiPick.atsTeam, null);
  assert.equal(pregameRow[0].aiPick.atsNote, 'pass ATS — side flipped');
  assert.equal(pregameRow[0].aiPick.wouldHaveAtsTeam, 'ARI');
  assert.equal(pregameRow[0].aiPick.atsFlipped, true);
  assert.equal(pregameRow[0].aiPickFreezeNow, true);
  assert.equal(decidePersist(pregameRow[0]).freeze, true);

  const open = applyAiSnapshots([{ ...fresh, locked: false }], [{
    game_id: fresh.game_id,
    frozen_at: null,
    payload: stored
  }]);
  assert.equal(open[0].aiPick.atsNote, 'pass ATS — side flipped');
  assert.equal(open[0].aiPick.atsTeam, null);
  assert.equal(decidePersist(open[0]).freeze, false);

  const sameSide = applyAiSnapshots([{ ...fresh, locked: false, aiPick: { ...fresh.aiPick, atsTeam: 'SEA', ats: 'SEA -3.5' } }], [{
    game_id: fresh.game_id,
    frozen_at: null,
    payload: stored
  }]);
  assert.equal(sameSide[0].aiPick.atsTeam, 'SEA');

  const firstLock = applyAiSnapshots([{ ...fresh, locked: true }], []);
  assert.equal(firstLock[0].aiPick.ats, 'ARI +3.5');
  assert.equal(firstLock[0].aiPickFreezeNow, true);
  assert.equal(pickFromPayload(JSON.stringify(stored)).expected, stored.expected);
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
