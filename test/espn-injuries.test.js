'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  ESPN_INJURIES,
  POLL_MS,
  parseInjuries,
  injuryVisible,
  injuriesForGame,
  scrubOverlappingPick,
  shouldRefreshInjuries,
  resolveInjuries,
  attachInjuries,
  resetMemoryCache
} = require('../src/espn-injuries');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'espn-injuries.json'), 'utf8'));

test('disabled ESPN client does not fetch injuries', () => {
  const prev = process.env.ESPN_LIVE;
  process.env.ESPN_LIVE = '0';
  assert.equal(shouldRefreshInjuries(new Date(), null).reason, 'disabled');
  if (prev == null) delete process.env.ESPN_LIVE;
  else process.env.ESPN_LIVE = prev;
});

test('injury cache is slower than the 5-minute live poll', () => {
  assert.equal(ESPN_INJURIES, 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries');
  assert.ok(POLL_MS >= 30 * 60 * 1000);
  assert.ok(POLL_MS <= 60 * 60 * 1000);
  assert.notEqual(POLL_MS, 5 * 60 * 1000);
});

test('parses Out, Doubtful, and Questionable and drops Active and IR', () => {
  const byTeam = parseInjuries(fixture);
  const sea = byTeam.SEA.map((p) => `${p.name}|${p.position}|${p.status}`);
  assert.deepEqual(sea.sort(), ['Jaxon Smith-Njigba|WR|Questionable', 'Sam Darnold|QB|Questionable']);
  const was = byTeam.WAS.map((p) => `${p.position}|${p.status}`).sort();
  assert.deepEqual(was, ['OT|Out', 'QB|Doubtful']);
  assert.equal(byTeam.CHI[0].position, 'QB');
  assert.equal(byTeam.CHI[0].status, 'Questionable');
});

test('shows Out and Doubtful, Questionable QBs, and hides other Questionable players', () => {
  const game = {
    away_team: 'SEA',
    home_team: 'WAS',
    away_qb_name: 'Sam Darnold',
    home_qb_name: 'Jayden Daniels'
  };
  const byTeam = parseInjuries(fixture);
  assert.equal(injuryVisible({ team: 'SEA', name: 'Jaxon Smith-Njigba', position: 'WR', status: 'Questionable' }, game), false);
  assert.equal(injuryVisible({ team: 'SEA', name: 'Sam Darnold', position: 'QB', status: 'Questionable' }, game), true);
  assert.equal(injuryVisible({ team: 'WAS', name: 'Example Tackle', position: 'OT', status: 'Out' }, game), true);
  assert.equal(injuryVisible({ team: 'WAS', name: 'Jayden Daniels', position: 'QB', status: 'Doubtful' }, game), true);
  const listed = injuryVisible({
    team: 'SEA',
    name: 'Sam Darnold',
    position: '',
    status: 'Questionable'
  }, game);
  assert.equal(listed, true);

  const rows = injuriesForGame(game, byTeam);
  assert.deepEqual(rows.map((r) => `${r.team} ${r.name} ${r.status}`), [
    'SEA Sam Darnold Questionable',
    'WAS Jayden Daniels Doubtful',
    'WAS Example Tackle Out'
  ]);
});

test('hides the injury list when neither team has a matching player', () => {
  const game = { away_team: 'GB', home_team: 'CHI', away_qb_name: 'Jordan Love', home_qb_name: 'Caleb Williams' };
  const onlyWr = {
    GB: [{ name: 'Romeo Doubs', position: 'WR', status: 'Questionable' }],
    CHI: [{ name: 'DJ Moore', position: 'WR', status: 'Questionable' }]
  };
  assert.deepEqual(injuriesForGame(game, onlyWr), []);
  const none = injuriesForGame({ away_team: 'GB', home_team: 'DET' }, parseInjuries(fixture));
  assert.deepEqual(none, []);
});

test('AI note drops lost-starter facts when the strip already shows that QB', () => {
  const game = {
    away_team: 'SEA',
    home_team: 'ARI',
    away_qb_name: 'Sam Darnold',
    aiPick: {}
  };
  const note = 'pass ATS — SEA lost starter; backup is not shown as the problem';
  const pick = {
    label: `${note} · take the over 41`,
    atsNote: note,
    ats: null
  };
  const shown = [{ team: 'SEA', name: 'Sam Darnold', position: 'QB', status: 'Questionable' }];
  const scrubbed = scrubOverlappingPick(pick, shown, game);
  assert.equal(scrubbed.label, 'pass ATS · take the over 41');
  assert.equal(scrubbed.atsNote, 'pass ATS');
  assert.doesNotMatch(scrubbed.label, /lost starter/);

  const kept = scrubOverlappingPick(pick, [
    { team: 'ARI', name: 'Example Tackle', position: 'OT', status: 'Out' }
  ], game);
  assert.equal(kept, null);

  const otherTeam = scrubOverlappingPick(pick, [
    { team: 'SEA', name: 'Jaxon Smith-Njigba', position: 'WR', status: 'Out' }
  ], game);
  assert.equal(otherTeam, null);
});

test('week load uses a fresh injury cache and refetches after 45 minutes', async () => {
  const prev = process.env.ESPN_LIVE;
  process.env.ESPN_LIVE = '1';
  resetMemoryCache();
  const now = new Date('2026-09-23T18:00:00Z');
  const fresh = {
    fetchedAt: '2026-09-23T17:40:00Z',
    byTeam: { SEA: [{ name: 'Sam Darnold', position: 'QB', status: 'Out' }] }
  };
  assert.equal(shouldRefreshInjuries(now, fresh).reason, 'fresh-cache');
  assert.equal(shouldRefreshInjuries(now, null).reason, 'week-load');
  const stale = { fetchedAt: '2026-09-23T16:00:00Z', byTeam: {} };
  assert.equal(shouldRefreshInjuries(now, stale).reason, 'stale');

  let calls = 0;
  const fetched = await resolveInjuries({
    now,
    snapshot: fresh,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => fixture };
    }
  });
  assert.equal(calls, 0);
  assert.equal(fetched.queried, false);
  assert.equal(fetched.byTeam.SEA[0].name, 'Sam Darnold');

  const refreshed = await resolveInjuries({
    now,
    snapshot: null,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => fixture };
    }
  });
  assert.equal(calls, 1);
  assert.equal(refreshed.queried, true);
  assert.ok(refreshed.byTeam.WAS);

  const game = { away_team: 'SEA', home_team: 'WAS', game_id: 'g', aiPick: { label: 'SEA -3 · take the under 44', atsNote: null } };
  const attached = await attachInjuries([game], {
    now,
    snapshot: refreshed,
    fetchImpl: async () => {
      throw new Error('should not refetch a fresh snapshot');
    }
  });
  assert.ok(attached.cards[0].injuries.length >= 1);
  assert.equal(attached.cards[0].injuries.some((i) => i.position === 'WR' && i.status === 'Questionable'), false);
  resetMemoryCache();
  if (prev == null) delete process.env.ESPN_LIVE;
  else process.env.ESPN_LIVE = prev;
});
