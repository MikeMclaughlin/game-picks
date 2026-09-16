'use strict';

const { roadTravel } = require('./teams');
const { toNumber, scoresReady } = require('./grader');
const { resultLetter } = require('./week-view');

function isByeBefore(games, team, kickoff) {
  const t = team;
  const before = Date.parse(kickoff);
  const prior = games
    .filter((g) => (g.home_team === t || g.away_team === t) && Date.parse(g.kickoff) < before)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  if (!prior.length) return false;
  const last = prior[0];
  const gapDays = (before - Date.parse(last.kickoff)) / 86400000;
  return gapDays >= 11;
}

function weatherBucket(game) {
  if (!game.roof || game.roof === 'dome' || game.roof === 'closed') return 'dome';
  const temp = toNumber(game.temp);
  const wind = toNumber(game.wind);
  if (temp != null && temp <= 40) return 'cold';
  if (wind != null && wind >= 15) return 'windy';
  return 'outdoors';
}

function restBucket(days) {
  if (days == null) return 'unknown';
  if (days <= 5) return 'short';
  if (days >= 11) return 'bye';
  return 'normal';
}

function afterBucket(history, team, game) {
  const before = Date.parse(game.kickoff);
  const prior = history
    .filter((g) => (g.home_team === team || g.away_team === team) && scoresReady(g) && Date.parse(g.kickoff) < before)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  if (!prior.length) {
    return isByeBefore(history, team, game.kickoff) ? 'bye' : 'none';
  }
  const last = prior[0];
  const letter = resultLetter(team, last);
  if (isByeBefore(history, team, game.kickoff)) return 'bye';
  if (letter === 'W') return 'win';
  if (letter === 'L') return 'loss';
  if (letter === 'T') return 'tie';
  return 'none';
}

function atsCover(game, team) {
  if (!scoresReady(game) || toNumber(game.spread_line) == null) return null;
  const margin = toNumber(game.home_score) - toNumber(game.away_score);
  const spread = toNumber(game.spread_line);
  if (margin === spread) return 'P';
  const cover = margin > spread ? game.home_team : game.away_team;
  return cover === team ? 'W' : 'L';
}

function ouResult(game) {
  if (!scoresReady(game) || toNumber(game.total_line) == null) return null;
  const total = toNumber(game.home_score) + toNumber(game.away_score);
  const line = toNumber(game.total_line);
  if (total === line) return 'P';
  return total > line ? 'O' : 'U';
}

function record(wins, losses, pushes = 0) {
  const played = wins + losses;
  return {
    wins,
    losses,
    pushes,
    pct: played ? wins / played : null,
    label: pushes ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`
  };
}

function tally(items, getOutcome) {
  let w = 0;
  let l = 0;
  let p = 0;
  for (const item of items) {
    const o = getOutcome(item);
    if (o === 'W' || o === 'O') w += 1;
    else if (o === 'L' || o === 'U') l += 1;
    else if (o === 'P') p += 1;
  }
  return record(w, l, p);
}

function teamHistory(games, teamFilter) {
  const teams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))].sort();
  const selected = teamFilter && teamFilter !== 'ALL' ? [teamFilter] : teams;
  const rows = [];
  for (const team of selected) {
    const played = games.filter((g) => (g.home_team === team || g.away_team === team) && scoresReady(g));
    const home = played.filter((g) => g.home_team === team && g.location !== 'Neutral');
    const road = played.filter((g) => g.away_team === team);
    const ats = tally(played, (g) => atsCover(g, team));
    const ou = tally(played, ouResult);
    const homeRec = tally(home, (g) => resultLetter(team, g));
    const roadRec = tally(road, (g) => resultLetter(team, g));
    const weather = {};
    for (const bucket of ['dome', 'outdoors', 'cold', 'windy']) {
      weather[bucket] = tally(
        played.filter((g) => weatherBucket(g) === bucket),
        (g) => resultLetter(team, g)
      );
    }
    const travelEast = tally(
      road.filter((g) => {
        const t = roadTravel(g.away_team, g.home_team);
        return t && t.dir === 'east';
      }),
      (g) => resultLetter(team, g)
    );
    const travelWest = tally(
      road.filter((g) => {
        const t = roadTravel(g.away_team, g.home_team);
        return t && t.dir === 'west';
      }),
      (g) => resultLetter(team, g)
    );
    const rest = {
      short: tally(
        played.filter((g) => {
          const d = g.home_team === team ? toNumber(g.home_rest) : toNumber(g.away_rest);
          return restBucket(d) === 'short';
        }),
        (g) => resultLetter(team, g)
      ),
      normal: tally(
        played.filter((g) => {
          const d = g.home_team === team ? toNumber(g.home_rest) : toNumber(g.away_rest);
          return restBucket(d) === 'normal';
        }),
        (g) => resultLetter(team, g)
      ),
      bye: tally(
        played.filter((g) => afterBucket(games, team, g) === 'bye'),
        (g) => resultLetter(team, g)
      )
    };
    const after = {
      win: tally(played.filter((g) => afterBucket(games, team, g) === 'win'), (g) => resultLetter(team, g)),
      loss: tally(played.filter((g) => afterBucket(games, team, g) === 'loss'), (g) => resultLetter(team, g)),
      bye: rest.bye
    };
    rows.push({
      team,
      games: played.length,
      ats,
      ou,
      home: homeRec,
      road: roadRec,
      weather,
      travel: { east: travelEast, west: travelWest },
      rest,
      after
    });
  }
  return { teams, rows };
}

module.exports = { teamHistory, weatherBucket, atsCover, ouResult, restBucket, afterBucket };
