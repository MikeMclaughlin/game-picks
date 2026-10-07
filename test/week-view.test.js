'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { impliedPoints, projectGame, projectGameFromRates, applyGameToRates, formatAtsPick, currentSeasonWeek, enrichGame, lastGameInfo, showRestDays, showRestWinPct, restAmountWinPct, lastFiveOutright, lastFiveAts, aiConfidence, ouConfidenceRaw, expectedCallLabel, aiPick, seasonRecord, formatRecord, settleStrip, favoriteAtsTone, compareWeekGames, weekVersus, cardPhase, defaultExpanded } = require('../src/week-view');
const { resetCalibration } = require('../src/calibration');
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
  resetCalibration();
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
  assert.equal(Object.prototype.hasOwnProperty.call(card.aiPick, 'atsConfidence'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(card.aiPick, 'ouConfidence'), true);
  assert.equal(card.aiPick.confidence, card.aiPick.atsConfidence);
  if (card.aiPick.ats) {
    assert.equal(typeof card.aiPick.confidence, 'number');
    assert.ok(card.aiPick.confidence >= 1 && card.aiPick.confidence <= 99);
    assert.equal(typeof card.aiPick.rawConfidence, 'number');
    assert.ok(card.aiPick.rawConfidence >= 51 && card.aiPick.rawConfidence <= 92);
  }
  if (card.aiPick.ou) {
    assert.equal(typeof card.aiPick.ouConfidence, 'number');
    assert.ok(card.aiPick.ouConfidence >= 51 && card.aiPick.ouConfidence <= 92);
  } else {
    assert.match(String(card.aiPick.ouNote || ''), /pass (under|O\/U)/);
  }
  assert.ok(card.aiPick.expected || card.aiPick.label);
  if (card.aiPick.ats && card.aiPick.ou) assert.match(card.aiPick.expected, / and /);
  assert.equal(card.spread_open, 5.5);
  assert.equal(card.total_open, 54.5);
  assert.equal(card.spreadMove.moved, false);
  assert.equal(card.totalMove.moved, false);
});

test('last-5 streaks are oldest-to-newest and keep ties and pushes', () => {
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
    g('2', '2026-09-14T17:00:00Z', 'ARI', 'SEA', 20, 20, 0),   // tie and spread push, older than the last five
    g('3', '2026-09-21T17:00:00Z', 'SEA', 'NE', 13, 16, 6),    // SEA L, F (margin -3 < 6 away covers)
    g('4', '2026-09-28T17:00:00Z', 'GB', 'SEA', 10, 27, 3),    // SEA W, C (margin -17 < 3 away covers)
    g('5', '2026-10-05T17:00:00Z', 'SEA', 'DET', 21, 20, 1),   // SEA W, ATS push
    g('6', '2026-10-12T17:00:00Z', 'LAR', 'SEA', 30, 10, -3),  // SEA L, F (margin 20, spread -3 home LAR favored? wait spread -3 means away favored. margin 20 > -3 home covers, SEA F)
    g('7', '2026-10-19T17:00:00Z', 'SEA', 'KC', 28, 14, 4)     // SEA W, C
  ];
  assert.equal(lastFiveOutright(history, team, before), 'L-W-W-L-W');
  assert.equal(lastFiveAts(history, team, before), 'F-C-P-F-C');
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
  assert.equal(later.home.lastFiveAts, 'F-C-P-F-C');
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
  resetCalibration();
  assert.equal(expectedCallLabel('BUF -5.5', 'over'), 'BUF -5.5 and Over');
  assert.equal(expectedCallLabel('SEA +3', 'under'), 'SEA +3 and Under');
  assert.equal(ouConfidenceRaw({ total_line: 46 }, { hasHistory: false, fadeHighTotal: true }), 54);
  assert.equal(aiConfidence({ total_line: 46 }, { hasHistory: false, fadeHighTotal: true }), 52);
  assert.equal(aiConfidence({ total_line: 40 }, { hasHistory: false, fadeHighTotal: false }), 52);
  const high = aiConfidence(
    { spread_line: 3, total_line: 44 },
    { hasHistory: true, projMargin: 10, projTotal: 52, sampleN: 80 }
  );
  assert.ok(high >= 51 && high <= 92);
  const pick = aiPick({ home_team: 'BUF', away_team: 'MIA', spread_line: 5.5, total_line: 47 }, {
    hasHistory: true,
    atsTeam: 'BUF',
    ou: 'over',
    projMargin: 8,
    projTotal: 50,
    sampleN: 40
  });
  assert.equal(pick.expected, 'BUF -5.5 and Over');
  assert.match(pick.label, /OVER/);
  assert.doesNotMatch(pick.label, /too big a dog/);
  assert.equal(typeof pick.confidence, 'number');
  assert.equal(pick.confidence, pick.atsConfidence);
  assert.equal(typeof pick.ouConfidence, 'number');
  assert.ok(pick.rawConfidence >= 51 && pick.rawConfidence <= 92);
  assert.ok(pick.confidence >= 1 && pick.confidence <= 99);
  const sameSpread = { ...pick };
  const louderTotal = aiPick({ home_team: 'BUF', away_team: 'MIA', spread_line: 5.5, total_line: 47 }, {
    hasHistory: true,
    atsTeam: 'BUF',
    ou: 'over',
    projMargin: 8,
    projTotal: 70,
    sampleN: 40
  });
  assert.equal(louderTotal.rawConfidence, sameSpread.rawConfidence);
  assert.notEqual(louderTotal.rawOuConfidence, pick.rawOuConfidence);
});

test('equal scoring rates pick the home side once home field is included', () => {
  const history = [];
  for (let i = 0; i < 2; i += 1) {
    history.push({
      game_id: `b${i}`,
      season: 2024,
      game_type: 'REG',
      kickoff: `2024-09-0${i + 1}T17:00:00Z`,
      home_team: 'BUF',
      away_team: 'NE',
      home_score: 24,
      away_score: 24,
      location: 'Home'
    });
    history.push({
      game_id: `m${i}`,
      season: 2024,
      game_type: 'REG',
      kickoff: `2024-09-0${i + 1}T20:00:00Z`,
      home_team: 'MIA',
      away_team: 'NYJ',
      home_score: 24,
      away_score: 24,
      location: 'Home'
    });
  }
  const game = {
    home_team: 'BUF',
    away_team: 'MIA',
    spread_line: 0,
    total_line: 44,
    kickoff: '2024-09-15T17:00:00Z',
    home_rest: 7,
    away_rest: 7
  };
  const proj = projectGame(game, history);
  let homeFor = 0;
  let homeN = 0;
  let awayFor = 0;
  let awayN = 0;
  for (const g of history) {
    if (g.home_team === 'BUF' || g.away_team === 'BUF') {
      homeFor += g.home_team === 'BUF' ? g.home_score : g.away_score;
      homeN += 1;
    }
    if (g.home_team === 'MIA' || g.away_team === 'MIA') {
      awayFor += g.home_team === 'MIA' ? g.home_score : g.away_score;
      awayN += 1;
    }
  }
  const naiveMargin = ((homeFor / homeN) + (24)) / 2 - ((awayFor / awayN) + (24)) / 2;
  const naiveTeam = naiveMargin > game.spread_line ? 'BUF' : 'MIA';
  assert.equal(naiveTeam, 'MIA');
  assert.equal(proj.atsTeam, 'BUF');
  assert.notEqual(proj.atsTeam, naiveTeam);
});

test('recent scoring slump can flip the total off the career rate', () => {
  const history = [];
  for (let i = 0; i < 8; i += 1) {
    history.push({
      game_id: `hot${i}`,
      season: 2023,
      game_type: 'REG',
      kickoff: `2023-10-${String(i + 1).padStart(2, '0')}T17:00:00Z`,
      home_team: 'BUF',
      away_team: 'NE',
      home_score: 31,
      away_score: 17,
      location: 'Home'
    });
    history.push({
      game_id: `mia${i}`,
      season: 2023,
      game_type: 'REG',
      kickoff: `2023-10-${String(i + 1).padStart(2, '0')}T20:00:00Z`,
      home_team: 'MIA',
      away_team: 'NYJ',
      home_score: 31,
      away_score: 17,
      location: 'Home'
    });
  }
  for (let i = 0; i < 6; i += 1) {
    history.push({
      game_id: `cold${i}`,
      season: 2024,
      game_type: 'REG',
      kickoff: `2024-11-${String(i + 1).padStart(2, '0')}T17:00:00Z`,
      home_team: 'BUF',
      away_team: 'NE',
      home_score: 10,
      away_score: 10,
      location: 'Home'
    });
    history.push({
      game_id: `mcold${i}`,
      season: 2024,
      game_type: 'REG',
      kickoff: `2024-11-${String(i + 1).padStart(2, '0')}T20:00:00Z`,
      home_team: 'MIA',
      away_team: 'NYJ',
      home_score: 10,
      away_score: 10,
      location: 'Home'
    });
  }
  const game = {
    home_team: 'BUF',
    away_team: 'MIA',
    spread_line: 3,
    total_line: 51,
    kickoff: '2024-12-01T18:00:00Z',
    home_rest: 7,
    away_rest: 7
  };
  const proj = projectGame(game, history);
  const rates = new Map();
  const ordered = history.slice().sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  for (const g of ordered) applyGameToRates(rates, g);
  const fromRates = projectGameFromRates(game, rates.get('BUF'), rates.get('MIA'));
  assert.equal(fromRates.atsTeam, proj.atsTeam);
  assert.equal(fromRates.ou, proj.ou);
  assert.equal(proj.ou, 'under');
  assert.ok(proj.projTotal < 51);
});

test('settle strip reports cover and under against the closing line', () => {
  const strip = settleStrip({
    home_team: 'HOU',
    away_team: 'TB',
    home_score: 19,
    away_score: 20,
    spread_line: 2.5,
    total_line: 42.5
  });
  assert.equal(strip.text, 'TB covered +2.5 score was UNDER 42.5');
  assert.equal(strip.atsTone, 'fail');
  assert.equal(strip.ouTone, 'neutral');
  const miss = settleStrip({
    home_team: 'HOU',
    away_team: 'TB',
    home_score: 21,
    away_score: 20,
    spread_line: 2.5,
    total_line: 42.5
  });
  assert.equal(miss.coverText, 'HOU did NOT cover 2.5');
  assert.equal(miss.atsTone, 'fail');
  assert.match(miss.totalText, /UNDER/);
  const favCover = settleStrip({
    home_team: 'HOU',
    away_team: 'TB',
    home_score: 24,
    away_score: 20,
    spread_line: 2.5,
    total_line: 42.5
  });
  assert.equal(favCover.atsTone, 'cover');
  const push = settleStrip({
    home_team: 'HOU',
    away_team: 'TB',
    home_score: 22,
    away_score: 20,
    spread_line: 2,
    total_line: 42
  });
  assert.match(push.text, /push/);
  assert.match(push.text, /PUSH 42/);
  assert.equal(push.atsTone, 'push');
});

test('favorite ATS tone follows closing favorite cover', () => {
  const scores = { home: 27, away: 20 };
  assert.equal(favoriteAtsTone({ spread_line: 3 }, scores), 'cover');
  assert.equal(favoriteAtsTone({ spread_line: 10 }, scores), 'fail');
  assert.equal(favoriteAtsTone({ spread_line: -3 }, scores), 'fail');
  assert.equal(favoriteAtsTone({ spread_line: -10 }, { home: 16, away: 27 }), 'cover');
  assert.equal(favoriteAtsTone({ spread_line: 7 }, scores), 'push');
  assert.equal(favoriteAtsTone({ spread_line: 0 }, { home: 21, away: 17 }), 'neutral');
});

test('week cards sort by kickoff then home team', () => {
  const slate = [
    { kickoff: '2026-09-13T17:00:00Z', home_team: 'SEA', away_team: 'SF' },
    { kickoff: '2026-09-13T17:00:00Z', home_team: 'BUF', away_team: 'MIA' },
    { kickoff: '2026-09-14T00:20:00Z', home_team: 'KC', away_team: 'BAL' },
    { kickoff: '2026-09-13T13:00:00Z', home_team: 'DAL', away_team: 'NYG' }
  ];
  const ordered = slate.slice().sort(compareWeekGames);
  assert.deepEqual(ordered.map((g) => g.home_team), ['DAL', 'BUF', 'SEA', 'KC']);
});

test('cards collapse by default on load', () => {
  const finalGame = { home_score: 20, away_score: 17, locked: true };
  const liveGame = { locked: true, live: { state: 'in', home_score: 7, away_score: 3 } };
  const openGame = { locked: false, home_score: null, away_score: null };
  assert.equal(cardPhase(finalGame), 'final');
  assert.equal(defaultExpanded(finalGame), false);
  assert.equal(cardPhase(liveGame), 'live');
  assert.equal(defaultExpanded(liveGame), false);
  assert.equal(cardPhase(openGame), 'pre');
  assert.equal(defaultExpanded(openGame), false);
});

test('week versus counts pushes in W-L-T and skips a signed-out user record', () => {
  const cards = [{
    home_team: 'HOU',
    away_team: 'TB',
    home_score: 20,
    away_score: 17,
    spread_line: 2.5,
    total_line: 36.5,
    aiPick: { atsTeam: 'HOU', ou: 'over' },
    wagers: [
      { market: 'ats', selection: 'TB', result: 'push' },
      { market: 'ou', selection: 'under', result: 'loss' },
      { market: 'outright', selection: 'HOU', result: 'win' }
    ]
  }];
  const signedOut = weekVersus(cards, { signedIn: false });
  assert.equal(signedOut.user, null);
  assert.equal(signedOut.ai.ats.label, '1-0');
  const signedIn = weekVersus(cards, { signedIn: true });
  assert.equal(signedIn.user.ats.label, '0-0-1');
  assert.equal(signedIn.user.ou.label, '0-1');
  assert.equal(signedIn.user.outright.label, '1-0');
  assert.equal(signedIn.ai.ou.label, '1-0');
});

test('last five keeps ties and spread pushes in the string', () => {
  const history = [
    { home_team: 'SEA', away_team: 'ARI', home_score: 10, away_score: 20, spread_line: 3, kickoff: '2024-09-08T17:00:00Z' },
    { home_team: 'SEA', away_team: 'ARI', home_score: 17, away_score: 17, spread_line: 0, kickoff: '2024-09-15T17:00:00Z' }
  ];
  assert.equal(lastFiveOutright(history, 'SEA', '2024-09-22T17:00:00Z'), 'L-T');
  assert.equal(lastFiveAts(history, 'SEA', '2024-09-22T17:00:00Z'), 'F-P');
});

test('huge dogs are not the gold ATS pick', () => {
  resetCalibration();
  const base = {
    hasHistory: true,
    ou: 'over',
    projTotal: 48,
    sampleN: 40
  };
  const ml = aiPick(
    { home_team: 'SF', away_team: 'MIA', spread_line: 13.5, total_line: 45.5, weekday: 'Sunday' },
    { ...base, atsTeam: 'MIA', projMargin: -2 }
  );
  assert.equal(ml.ats, null);
  assert.equal(ml.atsTeam, null);
  assert.equal(ml.ml, 'MIA ML');
  assert.equal(ml.atsMarket, 'ml');
  assert.equal(ml.confidence, null);
  assert.match(ml.expected, /MIA ML and Over/);

  const pass = aiPick(
    { home_team: 'SF', away_team: 'MIA', spread_line: 13.5, total_line: 45.5, weekday: 'Sunday' },
    { ...base, atsTeam: 'MIA', projMargin: 3 }
  );
  assert.equal(pass.atsMarket, 'pass');
  assert.equal(pass.ml, null);
  assert.match(pass.atsNote, /pass ATS/);
  assert.match(pass.atsNote, /\+13\.5/);
  assert.doesNotMatch(pass.atsNote, /too big a dog/);

  const homeDog = aiPick(
    { home_team: 'ARI', away_team: 'SEA', spread_line: -12, total_line: 44, weekday: 'Sunday' },
    { ...base, atsTeam: 'ARI', projMargin: -4 }
  );
  assert.equal(homeDog.atsTeam, null);
  assert.equal(homeDog.atsMarket, 'pass');
});

test('small home-dog fade after 50 allowed needs a bigger edge', () => {
  resetCalibration();
  const game = { home_team: 'CAR', away_team: 'CHI', spread_line: -2.5, total_line: 44, weekday: 'Sunday' };
  const soft = aiPick(game, {
    hasHistory: true,
    atsTeam: 'CHI',
    ou: 'over',
    projMargin: -4,
    projTotal: 48,
    sampleN: 20,
    homeLastAllowed: 59
  });
  assert.equal(soft.atsTeam, null);
  assert.match(soft.atsNote, /allowed 59/);

  const loud = aiPick(game, {
    hasHistory: true,
    atsTeam: 'CHI',
    ou: 'over',
    projMargin: -10,
    projTotal: 48,
    sampleN: 20,
    homeLastAllowed: 59
  });
  assert.equal(loud.atsTeam, 'CHI');
  assert.match(loud.atsNote, /flag/);
});

test('TNF and 50+ totals veto high-confidence unders and discount mild ones', () => {
  resetCalibration();
  const veto = aiPick(
    { home_team: 'BUF', away_team: 'DET', spread_line: 4.5, total_line: 54.5, weekday: 'Thursday' },
    { hasHistory: true, atsTeam: 'BUF', ou: 'under', projMargin: 8, projTotal: 40, sampleN: 40 }
  );
  assert.equal(veto.ou, null);
  assert.match(veto.ouNote, /pass under — TNF/);
  assert.equal(veto.ouConfidence, null);
  assert.equal(veto.atsTeam, 'BUF');
  assert.ok((veto.passes || []).some((row) => row.rule === 'tnf-under'));
  assert.ok((veto.passes || []).some((row) => row.rule === 'under-50'));

  const mild = aiPick(
    { home_team: 'GB', away_team: 'ATL', spread_line: 3, total_line: 46.5, weekday: 'Thursday' },
    { hasHistory: true, atsTeam: 'GB', ou: 'under', projMargin: 4, projTotal: 44.5, sampleN: 40 }
  );
  assert.equal(mild.ou, null);
  assert.equal(mild.ouConfidence, null);
  assert.match(mild.ouNote, /pass under — TNF/);
  assert.equal((mild.passes || []).some((row) => row.rule === 'under-50'), false);

  const sundayHigh = aiPick(
    { home_team: 'DAL', away_team: 'BAL', spread_line: -3, total_line: 52.5, weekday: 'Sunday' },
    { hasHistory: true, atsTeam: 'BAL', ou: 'under', projMargin: -6, projTotal: 40, sampleN: 40 }
  );
  assert.equal(sundayHigh.ou, null);
  assert.match(sundayHigh.ouNote, /total 50\+/);
});

test('road favorite that lost its starter is not faded without backup evidence', () => {
  resetCalibration();
  const game = {
    home_team: 'ARI',
    away_team: 'SEA',
    spread_line: -3.5,
    total_line: 41,
    weekday: 'Sunday',
    away_qb_name: 'Drew Lock'
  };
  const thin = aiPick(game, {
    hasHistory: true,
    atsTeam: 'ARI',
    ou: 'over',
    projMargin: -8,
    projTotal: 44,
    sampleN: 30,
    awayQb: {
      lastQb: 'geno smith',
      qbByName: new Map([
        ['geno smith', { n: 10, points: 240 }],
        ['drew lock', { n: 1, points: 14 }]
      ])
    }
  });
  assert.equal(thin.atsTeam, null);
  assert.match(thin.atsNote, /lost starter/);

  const shown = aiPick(game, {
    hasHistory: true,
    atsTeam: 'ARI',
    ou: 'over',
    projMargin: -8,
    projTotal: 44,
    sampleN: 30,
    awayQb: {
      lastQb: 'geno smith',
      qbByName: new Map([
        ['geno smith', { n: 10, points: 240 }],
        ['drew lock', { n: 3, points: 30 }]
      ])
    }
  });
  assert.equal(shown.atsTeam, 'ARI');
  assert.equal(shown.ats, 'ARI +3.5');
});
