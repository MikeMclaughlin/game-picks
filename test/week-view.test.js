'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { impliedPoints, projectGame, formatAtsPick, currentSeasonWeek, enrichGame, lastGameInfo } = require('../src/week-view');
const { roadTravel, teamCity } = require('../src/teams');
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

test('ATS labels mirror the signed spread on both sides', () => {
  const homeFav = { home_team: 'BUF', away_team: 'DET', spread_line: 4.5 };
  assert.equal(formatAtsPick('BUF', homeFav), 'BUF -4.5');
  assert.equal(formatAtsPick('DET', homeFav), 'DET +4.5');
  const awayFav = { home_team: 'DET', away_team: 'BUF', spread_line: -4.5 };
  assert.equal(formatAtsPick('BUF', awayFav), 'BUF -4.5');
  assert.equal(formatAtsPick('DET', awayFav), 'DET +4.5');
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

test('teamCity uses market names for two-city clubs', () => {
  assert.equal(teamCity('DET'), 'Detroit');
  assert.equal(teamCity('NYG'), 'NY Giants');
  assert.equal(teamCity('LA'), 'LA Rams');
});

test('lastGameInfo reports Win/Loss plus opponent and scores', () => {
  const prev = {
    home_team: 'DET',
    away_team: 'TB',
    home_score: 27,
    away_score: 20
  };
  const info = lastGameInfo('DET', prev);
  assert.equal(info.result, 'Win');
  assert.equal(info.letter, 'W');
  assert.equal(info.opponent, 'TB');
  assert.equal(info.teamScore, 27);
  assert.equal(info.oppScore, 20);
});

test('enrichGame exposes lastGame, city, short rest, and xPts from the line', () => {
  const prevDet = {
    game_id: '2026_01_TB_DET',
    home_team: 'DET',
    away_team: 'TB',
    home_score: 27,
    away_score: 20,
    kickoff: '2026-09-13T17:00:00-04:00',
    home_rest: 7,
    away_rest: 7,
    location: 'Home'
  };
  const prevBuf = {
    game_id: '2026_01_BUF_HOU',
    home_team: 'HOU',
    away_team: 'BUF',
    home_score: 31,
    away_score: 20,
    kickoff: '2026-09-13T17:00:00-04:00',
    home_rest: 7,
    away_rest: 7,
    location: 'Home'
  };
  const game = {
    game_id: '2026_02_DET_BUF',
    season: 2026,
    week: 2,
    game_type: 'REG',
    kickoff: '2026-09-17T20:15:00-04:00',
    weekday: 'Thursday',
    home_team: 'BUF',
    away_team: 'DET',
    spread_line: 5.5,
    total_line: 54.5,
    home_rest: 4,
    away_rest: 4,
    home_score: null,
    away_score: null
  };
  const card = enrichGame(game, [prevDet, prevBuf]);
  assert.equal(card.away.city, 'Detroit');
  assert.equal(card.home.city, 'Buffalo');
  assert.equal(card.away.lastGame.result, 'Win');
  assert.equal(card.home.lastGame.result, 'Loss');
  assert.equal(card.away.short, true);
  assert.equal(card.home.short, true);
  assert.equal(card.implied.away, 24.5);
  assert.equal(card.implied.home, 30);
  assert.equal(card.xPts.away, 24.5);
  assert.equal(card.xPts.home, 30);
  assert.equal(card.home.shortRestWinPct, null);
});
