'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { impliedPoints, projectGame, formatAtsPick, currentSeasonWeek, enrichGame, lastGameInfo, showRestDays, showRestWinPct, restAmountWinPct, lastFiveOutright, lastFiveAts, aiConfidence, expectedCallLabel, aiPick, seasonRecord, formatRecord } = require('../src/week-view');
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
  assert.match(UPSERT_SQL, /spread_open = COALESCE\(games\.spread_open/);
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

test('lastGameInfo reports WIN +margin / Loss -margin', () => {
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
  assert.equal(info.margin, 7);
  assert.equal(info.signed, '+7');
  assert.equal(info.label, 'WIN +7');
  const loss = lastGameInfo('TB', prev);
  assert.equal(loss.result, 'Loss');
  assert.equal(loss.margin, 7);
  assert.equal(loss.signed, '-7');
  assert.equal(loss.label, 'Loss -7');
  const tie = lastGameInfo('DET', { ...prev, home_score: 20, away_score: 20 });
  assert.equal(tie.result, 'Tie');
  assert.equal(tie.label, 'Tie');
});

test('showRestDays hides exactly 7 days of rest', () => {
  assert.equal(showRestDays(7), false);
  assert.equal(showRestDays('7'), false);
  assert.equal(showRestDays(4), true);
  assert.equal(showRestDays(8), true);
  assert.equal(showRestDays(null), false);
});

test('rest-amount win% shows when rest is not 7 or 8', () => {
  assert.equal(showRestWinPct(7), false);
  assert.equal(showRestWinPct(8), false);
  assert.equal(showRestWinPct(4), true);
  assert.equal(showRestWinPct(6), true);
  assert.equal(showRestWinPct(10), true);
  assert.equal(showRestWinPct(null), false);
  const games = [
    { home_team: 'DET', away_team: 'CHI', home_score: 21, away_score: 10, home_rest: 4, away_rest: 7 },
    { home_team: 'GB', away_team: 'DET', home_score: 24, away_score: 17, home_rest: 7, away_rest: 4 },
    { home_team: 'DET', away_team: 'MIN', home_score: 14, away_score: 20, home_rest: 7, away_rest: 7 }
  ];
  assert.equal(restAmountWinPct(games, 'DET', 4), 0.5);
  assert.equal(restAmountWinPct(games, 'DET', 7), null);
  assert.equal(restAmountWinPct(games, 'DET', 8), null);
});

test('enrichGame exposes lastGame, city, short rest, and xPts from the line', () => {
  const prevDet = {
    game_id: '2026_01_TB_DET',
    season: 2026,
    week: 1,
    game_type: 'REG',
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
    season: 2026,
    week: 1,
    game_type: 'REG',
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
  assert.equal(card.away.lastGame.margin, 7);
  assert.equal(card.away.lastGame.label, 'WIN +7');
  assert.equal(card.away.record.label, '1-0');
  assert.equal(card.away.ytdWinPct, 1);
  assert.equal(card.home.lastGame.result, 'Loss');
  assert.equal(card.home.record.label, '0-1');
  assert.equal(card.home.ytdWinPct, 0);
  assert.equal(card.home.lastGame.label, 'Loss -11');
  assert.equal(card.away.showRest, true);
  assert.equal(card.home.showRest, true);
  assert.equal(card.away.short, true);
  assert.equal(card.home.short, true);
  assert.equal(card.implied.away, 24.5);
  assert.equal(card.implied.home, 30);
  assert.equal(card.xPts.away, 24.5);
  assert.equal(card.xPts.home, 30);
  assert.equal(card.home.shortRestWinPct, null);
  assert.equal(card.away.showRestWinPct, true);
  assert.equal(card.home.showRestWinPct, true);
  assert.equal(Object.prototype.hasOwnProperty.call(card.away, 'restWinPct'), true);
  assert.equal(card.kickoffSlot, 'slot-thu');
  assert.equal(Object.prototype.hasOwnProperty.call(card.aiPick, 'confidence'), true);
  assert.equal(typeof card.aiPick.confidence, 'number');
  assert.ok(card.aiPick.confidence >= 51 && card.aiPick.confidence <= 92);
  assert.ok(card.aiPick.expected);
  assert.match(card.aiPick.expected, / and /);
  assert.equal(card.spread_open, 5.5);
  assert.equal(card.total_open, 54.5);
  assert.equal(card.spreadMove.moved, false);
  assert.equal(card.totalMove.moved, false);
});

test('last-5 streaks are oldest-to-newest and skip ties/pushes', () => {
  const team = 'SEA';
  const before = '2026-10-20T17:00:00Z';
  function g(id, kickoff, home, away, hs, as, spread) {
    return {
      game_id: id,
      home_team: home,
      away_team: away,
      home_score: hs,
      away_score: as,
      spread_line: spread,
      kickoff
    };
  }
  const history = [
    g('1', '2026-09-07T17:00:00Z', 'SEA', 'SF', 24, 17, 3),   // SEA W, C (margin 7 > 3)
    g('2', '2026-09-14T17:00:00Z', 'ARI', 'SEA', 20, 20, 0),   // tie omitted outright; ATS P omitted
    g('3', '2026-09-21T17:00:00Z', 'SEA', 'NE', 13, 16, 6),    // SEA L, F (margin -3 < 6 away covers)
    g('4', '2026-09-28T17:00:00Z', 'GB', 'SEA', 10, 27, 3),    // SEA W, C (margin -17 < 3 away covers)
    g('5', '2026-10-05T17:00:00Z', 'SEA', 'DET', 21, 20, 1),   // SEA W, P omitted ATS
    g('6', '2026-10-12T17:00:00Z', 'LAR', 'SEA', 30, 10, -3),  // SEA L, F (margin 20, spread -3 home LAR favored? wait spread -3 means away favored. margin 20 > -3 home covers, SEA F)
    g('7', '2026-10-19T17:00:00Z', 'SEA', 'KC', 28, 14, 4)     // SEA W, C
  ];
  assert.equal(lastFiveOutright(history, team, before), 'L-W-W-L-W');
  assert.equal(lastFiveAts(history, team, before), 'C-F-C-F-C');
  const later = enrichGame({
    game_id: 'now',
    season: 2026,
    week: 8,
    game_type: 'REG',
    kickoff: before,
    weekday: 'Sunday',
    home_team: 'SEA',
    away_team: 'CHI',
    spread_line: 3,
    total_line: 44,
    home_rest: 7,
    away_rest: 10,
    home_score: null,
    away_score: null
  }, history);
  assert.equal(later.home.lastFive, 'L-W-W-L-W');
  assert.equal(later.home.lastFiveAts, 'C-F-C-F-C');
  assert.equal(later.home.showRest, false);
  assert.equal(later.away.showRest, true);
});

test('seasonRecord is YTD from scored same-season games before kickoff', () => {
  assert.equal(formatRecord(1, 1, 0), '1-1');
  assert.equal(formatRecord(1, 1, 1), '1-1-1');
  function g(id, season, kickoff, home, away, hs, as, type) {
    return {
      game_id: id,
      season,
      week: 1,
      game_type: type || 'REG',
      home_team: home,
      away_team: away,
      home_score: hs,
      away_score: as,
      kickoff
    };
  }
  const history = [
    g('w1', 2026, '2026-09-13T17:00:00Z', 'NYG', 'DAL', 28, 20),
    g('w1b', 2026, '2026-09-13T17:00:00Z', 'LAR', 'SF', 7, 27),
    g('old', 2025, '2025-12-28T18:00:00Z', 'DAL', 'NYG', 10, 31),
    g('pre', 2026, '2026-08-20T00:00:00Z', 'NYG', 'NE', 24, 10, 'PRE'),
    g('later', 2026, '2026-09-21T20:15:00-04:00', 'LAR', 'NYG', 14, 17)
  ];
  const nyg = seasonRecord(history, 'NYG', 2026, '2026-09-21T20:15:00-04:00');
  assert.equal(nyg.label, '1-0');
  assert.equal(nyg.wins, 1);
  assert.equal(nyg.losses, 0);
  assert.equal(nyg.winPct, 1);
  const lar = seasonRecord(history, 'LAR', 2026, '2026-09-21T20:15:00-04:00');
  assert.equal(lar.label, '0-1');
  assert.equal(lar.winPct, 0);
  const empty = seasonRecord(history, 'NYG', 2026, '2026-09-10T00:00:00Z');
  assert.equal(empty.label, '0-0');
  assert.equal(empty.winPct, null);
  const tied = seasonRecord([
    g('t', 2026, '2026-09-13T17:00:00Z', 'DET', 'CHI', 20, 20)
  ], 'DET', 2026, '2026-09-20T17:00:00Z');
  assert.equal(tied.label, '0-0-1');
  assert.equal(tied.winPct, null);
});

test('enrichGame attaches YTD record and travel win% for 2+ tz road games', () => {
  const nygWin = {
    game_id: '2025_12_NYG_SEA',
    season: 2025,
    week: 12,
    game_type: 'REG',
    home_team: 'SEA',
    away_team: 'NYG',
    home_score: 10,
    away_score: 17,
    kickoff: '2025-11-23T21:05:00Z',
    location: 'Home'
  };
  const nygLoss = {
    game_id: '2025_08_NYG_SF',
    season: 2025,
    week: 8,
    game_type: 'REG',
    home_team: 'SF',
    away_team: 'NYG',
    home_score: 24,
    away_score: 10,
    kickoff: '2025-10-26T20:25:00Z',
    location: 'Home'
  };
  const nygEast = {
    game_id: '2025_04_NYG_BUF',
    season: 2025,
    week: 4,
    game_type: 'REG',
    home_team: 'BUF',
    away_team: 'NYG',
    home_score: 14,
    away_score: 21,
    kickoff: '2025-09-28T17:00:00Z',
    location: 'Home'
  };
  const week1Nyg = {
    game_id: '2026_01_DAL_NYG',
    season: 2026,
    week: 1,
    game_type: 'REG',
    home_team: 'NYG',
    away_team: 'DAL',
    home_score: 28,
    away_score: 20,
    kickoff: '2026-09-13T20:20:00-04:00',
    location: 'Home'
  };
  const week1Lar = {
    game_id: '2026_01_SF_LA',
    season: 2026,
    week: 1,
    game_type: 'REG',
    home_team: 'LAR',
    away_team: 'SF',
    home_score: 7,
    away_score: 27,
    kickoff: '2026-09-10T20:35:00-04:00',
    location: 'Neutral'
  };
  const game = {
    game_id: '2026_02_NYG_LA',
    season: 2026,
    week: 2,
    game_type: 'REG',
    kickoff: '2026-09-21T20:15:00-04:00',
    weekday: 'Monday',
    home_team: 'LAR',
    away_team: 'NYG',
    spread_line: 7,
    total_line: 47.5,
    home_rest: 11,
    away_rest: 8,
    home_score: null,
    away_score: null
  };
  const card = enrichGame(game, [nygWin, nygLoss, nygEast, week1Nyg, week1Lar]);
  assert.equal(card.away.record.label, '1-0');
  assert.equal(card.away.ytdWinPct, 1);
  assert.equal(card.home.record.label, '0-1');
  assert.equal(card.home.ytdWinPct, 0);
  assert.equal(card.away.travel.dir, 'west');
  assert.equal(card.away.travel.zones, 3);
  assert.equal(card.away.travel.label, 'west +3tz');
  assert.equal(card.away.travel.winPct, 0.5);
  assert.equal(card.home.travel, undefined);
});

test('expected call label and confidence stay in documented bounds', () => {
  assert.equal(expectedCallLabel('BUF -5.5', 'over'), 'BUF -5.5 and Over');
  assert.equal(expectedCallLabel('SEA +3', 'under'), 'SEA +3 and Under');
  assert.equal(aiConfidence({ total_line: 46 }, { hasHistory: false, fadeHighTotal: true }), 54);
  assert.equal(aiConfidence({ total_line: 40 }, { hasHistory: false, fadeHighTotal: false }), 52);
  const high = aiConfidence(
    { spread_line: 3, total_line: 44 },
    { hasHistory: true, projMargin: 10, projTotal: 52, sampleN: 80 }
  );
  assert.ok(high >= 51 && high <= 92);
  const pick = aiPick({ home_team: 'BUF', away_team: 'MIA', spread_line: 5.5, total_line: 48 }, {
    hasHistory: true,
    atsTeam: 'BUF',
    ou: 'over',
    projMargin: 8,
    projTotal: 50,
    sampleN: 40
  });
  assert.equal(pick.expected, 'BUF -5.5 and Over');
  assert.equal(typeof pick.confidence, 'number');
});
