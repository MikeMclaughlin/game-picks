'use strict';

const HISTORY_FROM_SEASON = 2016;

function currentNflSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 3 ? year : year - 1;
}

function defaultSeasons(now = new Date()) {
  const current = currentNflSeason(now);
  const seasons = [];
  for (let y = HISTORY_FROM_SEASON; y <= current; y += 1) seasons.push(y);
  return seasons;
}

function seasonsFromYear(startYear, now = new Date()) {
  const current = currentNflSeason(now);
  const start = Number(startYear);
  const seasons = [];
  const from = Number.isFinite(start) ? start : HISTORY_FROM_SEASON;
  for (let y = from; y <= current; y += 1) seasons.push(y);
  return seasons;
}

function historyWindow(games, season, from = HISTORY_FROM_SEASON) {
  const cap = Number(season);
  return (games || []).filter((g) => {
    const s = Number(g.season);
    if (!Number.isFinite(s) || s < from) return false;
    if (Number.isFinite(cap) && s > cap) return false;
    return true;
  });
}

module.exports = {
  HISTORY_FROM_SEASON,
  currentNflSeason,
  defaultSeasons,
  seasonsFromYear,
  historyWindow
};
