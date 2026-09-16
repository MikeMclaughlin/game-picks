'use strict';

const MARKETS = new Set(['outright', 'ats', 'ou']);

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scoresReady(game) {
  return toNumber(game.home_score) != null && toNumber(game.away_score) != null;
}

function gradeOutright(game, selection) {
  if (!scoresReady(game)) return { result: 'ungraded', points: 0 };
  const home = toNumber(game.home_score);
  const away = toNumber(game.away_score);
  if (home === away) return { result: 'push', points: 0 };
  const winner = home > away ? game.home_team : game.away_team;
  if (selection === winner) return { result: 'win', points: 1 };
  return { result: 'loss', points: 0 };
}

function gradeAts(game, selection) {
  if (!scoresReady(game)) return { result: 'ungraded', points: 0 };
  const spread = toNumber(game.spread_line);
  if (spread == null) return { result: 'ungraded', points: 0 };
  const margin = toNumber(game.home_score) - toNumber(game.away_score);
  if (margin === spread) return { result: 'push', points: 0 };
  const coverTeam = margin > spread ? game.home_team : game.away_team;
  if (selection === coverTeam) return { result: 'win', points: 1 };
  return { result: 'loss', points: 0 };
}

function gradeOu(game, selection) {
  if (!scoresReady(game)) return { result: 'ungraded', points: 0 };
  const line = toNumber(game.total_line);
  if (line == null) return { result: 'ungraded', points: 0 };
  const total = toNumber(game.home_score) + toNumber(game.away_score);
  if (total === line) return { result: 'push', points: 0 };
  const side = total > line ? 'over' : 'under';
  if (selection === side) return { result: 'win', points: 1 };
  return { result: 'loss', points: 0 };
}

function gradeWager(game, market, selection) {
  if (market === 'outright') return gradeOutright(game, selection);
  if (market === 'ats') return gradeAts(game, selection);
  if (market === 'ou') return gradeOu(game, selection);
  const err = new Error(`Unknown market: ${market}`);
  err.statusCode = 400;
  throw err;
}

function kickoffMs(game, now = Date.now()) {
  const t = game.kickoff instanceof Date ? game.kickoff.getTime() : Date.parse(game.kickoff);
  return Number.isFinite(t) ? t : now;
}

function isLocked(game, now = Date.now()) {
  return now >= kickoffMs(game, now);
}

function lineForMarket(game, market) {
  if (market === 'ats') return toNumber(game.spread_line);
  if (market === 'ou') return toNumber(game.total_line);
  return null;
}

function validatePick(game, market, selection, now = Date.now()) {
  if (!game) {
    const err = new Error('Game not found');
    err.statusCode = 404;
    throw err;
  }
  if (!MARKETS.has(market)) {
    const err = new Error('Market must be outright, ats, or ou');
    err.statusCode = 400;
    throw err;
  }
  if (isLocked(game, now)) {
    const err = new Error('Picks lock at kickoff');
    err.statusCode = 409;
    throw err;
  }
  const sel = String(selection || '').trim().toLowerCase();
  if (market === 'ou') {
    if (sel !== 'over' && sel !== 'under') {
      const err = new Error('O/U pick must be over or under');
      err.statusCode = 400;
      throw err;
    }
    if (toNumber(game.total_line) == null) {
      const err = new Error('No total line posted for this game');
      err.statusCode = 400;
      throw err;
    }
    return { market, selection: sel, lineAtPick: toNumber(game.total_line) };
  }
  const team = String(selection || '').trim().toUpperCase();
  if (team !== game.home_team && team !== game.away_team) {
    const err = new Error('Pick must be one of the two teams');
    err.statusCode = 400;
    throw err;
  }
  if (market === 'ats' && toNumber(game.spread_line) == null) {
    const err = new Error('No spread posted for this game');
    err.statusCode = 400;
    throw err;
  }
  return { market, selection: team, lineAtPick: lineForMarket(game, market) };
}

async function gradeAll(sql) {
  if (!sql) {
    return { ok: false, error: 'DATABASE_URL is not set', graded: 0 };
  }
  const rows = await sql`
    SELECT w.id AS wager_id, w.user_id, w.game_id, w.market, w.selection, w.line_at_pick,
           g.home_team, g.away_team, g.home_score, g.away_score, g.spread_line, g.total_line,
           wr.result AS existing_result, wr.home_score AS graded_home, wr.away_score AS graded_away
    FROM wagers w
    JOIN games g ON g.game_id = w.game_id
    LEFT JOIN wager_results wr ON wr.wager_id = w.id
    WHERE g.home_score IS NOT NULL AND g.away_score IS NOT NULL
  `;
  let graded = 0;
  let skipped = 0;
  for (const row of rows) {
    const outcome = gradeWager(row, row.market, row.selection);
    if (outcome.result === 'ungraded') {
      skipped += 1;
      continue;
    }
    const same =
      row.existing_result === outcome.result &&
      Number(row.graded_home) === Number(row.home_score) &&
      Number(row.graded_away) === Number(row.away_score);
    if (same) {
      skipped += 1;
      continue;
    }
    await sql`
      INSERT INTO wager_results (wager_id, result, points, graded_at, home_score, away_score, spread_line, total_line)
      VALUES (
        ${row.wager_id}, ${outcome.result}, ${outcome.points}, now(),
        ${row.home_score}, ${row.away_score}, ${row.spread_line}, ${row.total_line}
      )
      ON CONFLICT (wager_id) DO UPDATE SET
        result = EXCLUDED.result,
        points = EXCLUDED.points,
        graded_at = EXCLUDED.graded_at,
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        spread_line = EXCLUDED.spread_line,
        total_line = EXCLUDED.total_line
    `;
    await sql`
      INSERT INTO wager_history (
        wager_id, user_id, game_id, market, selection, line_at_pick, action, result, points
      ) VALUES (
        ${row.wager_id}, ${row.user_id}, ${row.game_id}, ${row.market}, ${row.selection},
        ${row.line_at_pick}, 'grade', ${outcome.result}, ${outcome.points}
      )
    `;
    graded += 1;
  }
  return { ok: true, graded, skipped, total: rows.length };
}

module.exports = {
  MARKETS,
  toNumber,
  scoresReady,
  gradeOutright,
  gradeAts,
  gradeOu,
  gradeWager,
  isLocked,
  kickoffMs,
  validatePick,
  gradeAll
};
