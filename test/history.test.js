'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseHistoryFilters,
  matchesGlobalFilters,
  matchesTeamFilters,
  weatherBucket,
  roofBucket,
  roleForTeam,
  teamHistory,
  historyPayload
} = require('../src/history');
const { sameDivision, distanceBucket, teamDivision } = require('../src/teams');

function game(overrides = {}) {
  return {
    game_id: overrides.game_id || 'g1',
    season: 2024,
    week: 1,
    game_type: 'REG',
    kickoff: '2024-09-08T17:00:00Z',
    home_team: 'BUF',
    away_team: 'MIA',
    home_score: 21,
    away_score: 14,
    spread_line: 3,
    total_line: 44,
    home_rest: 7,
    away_rest: 7,
    roof: 'outdoors',
    temp: 70,
    wind: 5,
    location: 'Home',
    ...overrides
  };
}

test('parseHistoryFilters normalizes aliases and swaps inverted years', () => {
  const f = parseHistoryFilters(new URLSearchParams('from=2026&to=2023&site=away&distance=cross-country&daysOff=bye%2B&role=dog&division=div&roof=outdoors'));
  assert.equal(f.from, 2023);
  assert.equal(f.to, 2026);
  assert.equal(f.site, 'road');
  assert.equal(f.distance, 'cross');
  assert.equal(f.daysOff, 'bye');
  assert.equal(f.role, 'underdog');
  assert.equal(f.division, 'divisional');
  assert.equal(f.roof, 'outdoor');
});

test('roof and weather buckets', () => {
  assert.equal(roofBucket({ roof: 'dome' }), 'dome');
  assert.equal(roofBucket({ roof: 'outdoors' }), 'outdoor');
  assert.equal(roofBucket({ roof: 'closed' }), 'retractable');
  assert.equal(roofBucket({ roof: 'open' }), 'retractable');
  assert.equal(weatherBucket({ roof: 'outdoors', temp: 32, wind: 20 }), 'cold');
  assert.equal(weatherBucket({ roof: 'outdoors', temp: 55, wind: 18 }), 'windy');
  assert.equal(weatherBucket({ roof: 'outdoors', temp: 70, wind: 5 }), 'outdoors');
  assert.equal(weatherBucket({ roof: 'dome', temp: 32, wind: 20 }), 'dome');
});

test('role, division, and distance helpers', () => {
  assert.equal(roleForTeam(game({ home_team: 'BUF', away_team: 'KC', spread_line: 3 }), 'BUF'), 'favorite');
  assert.equal(roleForTeam(game({ home_team: 'BUF', away_team: 'KC', spread_line: 3 }), 'KC'), 'underdog');
  assert.equal(roleForTeam(game({ home_team: 'BUF', away_team: 'KC', spread_line: -3 }), 'BUF'), 'underdog');
  assert.equal(teamDivision('SEA'), 'NFC West');
  assert.equal(sameDivision('SEA', 'SF'), true);
  assert.equal(sameDivision('SEA', 'BUF'), false);
  assert.equal(distanceBucket('SEA', 'BUF'), 'cross');
  assert.equal(distanceBucket('BUF', 'MIA'), 'local');
});

test('global filters narrow games', () => {
  const cold = game({ game_id: 'cold', temp: 20, wind: 2, roof: 'outdoors' });
  const dome = game({ game_id: 'dome', roof: 'dome', temp: null, wind: null });
  const div = game({ game_id: 'div', home_team: 'SEA', away_team: 'SF' });
  const filters = parseHistoryFilters({ weather: 'cold', from: 2024, to: 2024 });
  assert.equal(matchesGlobalFilters(cold, filters), true);
  assert.equal(matchesGlobalFilters(dome, filters), false);
  assert.equal(matchesGlobalFilters(div, parseHistoryFilters({ division: 'divisional' })), true);
  assert.equal(matchesGlobalFilters(div, parseHistoryFilters({ division: 'non-div' })), false);
  assert.equal(matchesGlobalFilters(game({ roof: 'closed' }), parseHistoryFilters({ roof: 'retractable' })), true);
});

test('team-relative site/travel/role/rest filters', () => {
  const home = game({ home_team: 'SEA', away_team: 'NE', location: 'Home', spread_line: 4, home_rest: 4 });
  const roadEast = game({ home_team: 'BUF', away_team: 'SEA', location: 'Home', spread_line: 3, away_rest: 12 });
  assert.equal(matchesTeamFilters(home, 'SEA', parseHistoryFilters({ site: 'home' })), true);
  assert.equal(matchesTeamFilters(home, 'SEA', parseHistoryFilters({ site: 'road' })), false);
  assert.equal(matchesTeamFilters(roadEast, 'SEA', parseHistoryFilters({ travel: 'east' })), true);
  assert.equal(matchesTeamFilters(roadEast, 'SEA', parseHistoryFilters({ travel: 'west' })), false);
  assert.equal(matchesTeamFilters(home, 'SEA', parseHistoryFilters({ role: 'favorite' })), true);
  assert.equal(matchesTeamFilters(home, 'SEA', parseHistoryFilters({ daysOff: 'short' })), true);
  assert.equal(matchesTeamFilters(roadEast, 'SEA', parseHistoryFilters({ daysOff: 'bye' })), true);
  assert.equal(matchesTeamFilters(home, 'SEA', parseHistoryFilters({ distance: 'cross' })), true);
  assert.equal(matchesTeamFilters(game({ home_team: 'BUF', away_team: 'MIA' }), 'BUF', parseHistoryFilters({ distance: 'local' })), true);
});

test('teamHistory applies filters before aggregation', () => {
  const games = [
    game({ game_id: 'h1', home_team: 'SEA', away_team: 'ARI', location: 'Home', season: 2024, home_score: 20, away_score: 10 }),
    game({ game_id: 'r1', home_team: 'ARI', away_team: 'SEA', location: 'Home', season: 2024, home_score: 17, away_score: 14 }),
    game({ game_id: 'old', home_team: 'SEA', away_team: 'SF', location: 'Home', season: 2023, home_score: 30, away_score: 3 })
  ];
  const all = teamHistory(games, 'SEA', { filters: parseHistoryFilters({ team: 'SEA', from: 2023, to: 2024 }) });
  assert.equal(all.rows[0].games, 3);
  const home = teamHistory(games, 'SEA', { filters: parseHistoryFilters({ team: 'SEA', from: 2023, to: 2024, site: 'home' }) });
  assert.equal(home.rows[0].games, 2);
  assert.equal(home.rows[0].road.wins + home.rows[0].road.losses, 0);
  const year = teamHistory(games, 'SEA', { filters: parseHistoryFilters({ team: 'SEA', from: 2024, to: 2024 }) });
  assert.equal(year.rows[0].games, 2);
});

test('historyPayload reports supported filters and empty rows when none match', () => {
  const payload = historyPayload([game({ season: 2024, roof: 'dome' })], parseHistoryFilters({ weather: 'cold', from: 2024, to: 2024 }));
  assert.equal(payload.ok, true);
  assert.equal(payload.matchedGames, 0);
  assert.equal(payload.rows.length, 0);
  assert.equal(payload.supported.division, true);
  assert.ok(payload.notes.distance);
});
