'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  matchKey,
  parseScoreboard,
  attachLiveToGames,
  formatLiveDetail,
  showScoreRow,
  gamePossiblyLive,
  shouldQueryEspn,
  shouldRefreshEspn,
  resolveLiveScores,
  applyLive,
  resetMemoryCache,
  POLL_MS
} = require('../src/espn-live');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'espn-scoreboard.json'), 'utf8'));

function games() {
  return [
    {
      game_id: '2026_02_IND_KC',
      season: 2026,
      week: 2,
      game_type: 'REG',
      kickoff: '2026-09-21T00:20:00Z',
      away_team: 'IND',
      home_team: 'KC',
      home_score: null,
      away_score: null
    },
    {
      game_id: '2026_02_WAS_DAL',
      season: 2026,
      week: 2,
      game_type: 'REG',
      kickoff: '2026-09-20T20:25:00Z',
      away_team: 'WAS',
      home_team: 'DAL',
      home_score: null,
      away_score: null
    },
    {
      game_id: '2026_02_NYG_LA',
      season: 2026,
      week: 2,
      game_type: 'REG',
      kickoff: '2026-09-22T00:15:00Z',
      away_team: 'NYG',
      home_team: 'LA',
      home_score: null,
      away_score: null
    }
  ];
}

test('maps ESPN WSH/LAR abbreviations onto nflverse keys', () => {
  assert.equal(matchKey('WSH', 'DAL'), 'WAS@DAL');
  assert.equal(matchKey('NYG', 'LA'), 'NYG@LAR');
  assert.equal(matchKey('NYG', 'LAR'), 'NYG@LAR');
});

test('parses live, final, and pregame ESPN events', () => {
  const events = parseScoreboard(fixture);
  const byKey = Object.fromEntries(events.map((e) => [e.key, e]));
  assert.equal(byKey['IND@KC'].state, 'in');
  assert.equal(byKey['IND@KC'].away_score, 7);
  assert.equal(byKey['IND@KC'].home_score, 3);
  assert.equal(byKey['IND@KC'].detail, 'Q1 6:03');
  assert.equal(byKey['IND@KC'].show, true);
  assert.equal(byKey['WAS@DAL'].state, 'post');
  assert.equal(byKey['WAS@DAL'].away_score, 20);
  assert.equal(byKey['WAS@DAL'].home_score, 37);
  assert.equal(byKey['WAS@DAL'].detail, 'Final');
  assert.equal(byKey['GB@NYJ'].detail, 'Final/OT');
  assert.equal(byKey['NYG@LAR'].state, 'pre');
  assert.equal(byKey['NYG@LAR'].show, false);
  assert.equal(byKey['NYG@LAR'].detail, null);
});

test('attaches ESPN events to nflverse game_ids', () => {
  const byGame = attachLiveToGames(games(), parseScoreboard(fixture));
  assert.equal(byGame['2026_02_IND_KC'].detail, 'Q1 6:03');
  assert.equal(byGame['2026_02_WAS_DAL'].state, 'post');
  assert.equal(byGame['2026_02_NYG_LA'].state, 'pre');
  assert.equal(byGame['2026_02_NYG_LA'].show, false);
});

test('score row hides pregame and shows live/final when scores exist', () => {
  assert.equal(showScoreRow({ state: 'pre', home_score: 0, away_score: 0 }), false);
  assert.equal(showScoreRow({ state: 'in', home_score: 3, away_score: 7 }), true);
  assert.equal(showScoreRow({ state: 'post', home_score: 37, away_score: 20 }), true);
  assert.equal(showScoreRow({ state: 'post', home_score: null, away_score: null }), false);
  assert.equal(formatLiveDetail({ period: 2, displayClock: '12:29', type: { state: 'in' } }), 'Q2 12:29');
  assert.equal(formatLiveDetail({ period: 5, displayClock: '4:11', type: { state: 'in' } }), 'OT 4:11');
});

test('gates ESPN to current-week games that are actually in progress', () => {
  const week = games();
  const beforeKick = new Date('2026-09-20T16:00:00Z');
  assert.deepEqual(shouldQueryEspn(week, beforeKick, null), { query: false, reason: 'idle' });

  const duringSnf = new Date('2026-09-21T00:40:00Z');
  assert.deepEqual(shouldQueryEspn(week, duringSnf, null), { query: true, reason: 'in-progress' });

  const afterSnfBeforeMnf = new Date('2026-09-21T12:00:00Z');
  assert.deepEqual(shouldQueryEspn(week, afterSnfBeforeMnf, null), { query: false, reason: 'idle' });

  const cachedIn = {
    fetchedAt: '2026-09-21T00:35:00Z',
    byGame: { '2026_02_IND_KC': { state: 'in', home_score: 3, away_score: 7 } }
  };
  assert.deepEqual(shouldQueryEspn(week, afterSnfBeforeMnf, cachedIn), { query: true, reason: 'in-progress' });
  assert.deepEqual(shouldRefreshEspn(week, new Date('2026-09-21T00:36:00Z'), cachedIn), {
    query: false,
    reason: 'fresh-cache'
  });
  assert.deepEqual(shouldRefreshEspn(week, new Date(Date.parse(cachedIn.fetchedAt) + POLL_MS), cachedIn), {
    query: true,
    reason: 'in-progress'
  });

  const cachedPost = {
    fetchedAt: '2026-09-21T04:00:00Z',
    byGame: { '2026_02_IND_KC': { state: 'post', home_score: 17, away_score: 20 } }
  };
  assert.equal(gamePossiblyLive(week[0], afterSnfBeforeMnf.getTime(), cachedPost.byGame['2026_02_IND_KC']), false);
  assert.deepEqual(shouldQueryEspn(week, afterSnfBeforeMnf, cachedPost), { query: false, reason: 'idle' });
});

test('resolveLiveScores skips the network when idle and uses injected fetch when live', async () => {
  resetMemoryCache();
  const week = games();
  const idle = await resolveLiveScores(week, { now: new Date('2026-09-20T16:00:00Z'), snapshot: null });
  assert.equal(idle.queried, false);
  assert.equal(idle.reason, 'idle');
  assert.equal(idle.livePoll, false);

  let calls = 0;
  const live = await resolveLiveScores(week, {
    now: new Date('2026-09-21T00:40:00Z'),
    snapshot: null,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => fixture };
    }
  });
  assert.equal(calls, 1);
  assert.equal(live.queried, true);
  assert.equal(live.reason, 'in-progress');
  assert.equal(live.livePoll, true);
  assert.equal(live.byGame['2026_02_IND_KC'].detail, 'Q1 6:03');
  assert.equal(live.byGame['2026_02_WAS_DAL'].show, true);

  const cached = await resolveLiveScores(week, {
    now: new Date('2026-09-21T00:42:00Z'),
    snapshot: { fetchedAt: '2026-09-21T00:40:00Z', byGame: live.byGame, anyIn: true },
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => fixture };
    }
  });
  assert.equal(calls, 1);
  assert.equal(cached.queried, false);
  assert.equal(cached.reason, 'fresh-cache');
  assert.equal(cached.livePoll, true);

  const cards = applyLive([{ game_id: '2026_02_IND_KC', home_team: 'KC' }], live.byGame);
  assert.equal(cards[0].live.away_score, 7);
  resetMemoryCache();
});
