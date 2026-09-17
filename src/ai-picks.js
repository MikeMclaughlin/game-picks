'use strict';

function pickPayload(card) {
  const ai = card.aiPick || {};
  const confidence = ai.confidence == null || ai.confidence === '' ? null : Number(ai.confidence);
  return {
    ats: ai.ats || null,
    ou: ai.ou || null,
    ouText: ai.ouText || null,
    label: ai.label || null,
    expected: ai.expected || null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    atsTeam: ai.atsTeam || null,
    home_team: card.home_team,
    away_team: card.away_team,
    spread_line: card.spread_line == null ? null : Number(card.spread_line),
    total_line: card.total_line == null ? null : Number(card.total_line)
  };
}

async function persistAiPicks(sql, cards) {
  if (!sql || !Array.isArray(cards) || !cards.length) return { ok: true, saved: 0 };
  let saved = 0;
  for (const card of cards) {
    if (!card || !card.game_id || !card.aiPick) continue;
    const payload = pickPayload(card);
    const generatedAt = new Date().toISOString();
    await sql`
      INSERT INTO ai_picks (
        game_id, season, week, home_team, away_team, spread_line, total_line, payload, generated_at, updated_at
      ) VALUES (
        ${card.game_id}, ${card.season}, ${card.week}, ${card.home_team}, ${card.away_team},
        ${card.spread_line}, ${card.total_line}, ${payload}, ${generatedAt}::timestamptz, now()
      )
      ON CONFLICT (game_id) DO UPDATE SET
        season = EXCLUDED.season,
        week = EXCLUDED.week,
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        spread_line = EXCLUDED.spread_line,
        total_line = EXCLUDED.total_line,
        payload = EXCLUDED.payload,
        generated_at = EXCLUDED.generated_at,
        updated_at = now()
      WHERE ai_picks.payload IS DISTINCT FROM EXCLUDED.payload
    `;
    saved += 1;
  }
  return { ok: true, saved };
}

async function listAiPicks(sql, filters = {}) {
  if (!sql) return [];
  const gameId = filters.gameId || filters.game_id;
  const season = filters.season == null || filters.season === '' ? null : Number(filters.season);
  const week = filters.week == null || filters.week === '' ? null : Number(filters.week);
  if (gameId) {
    return sql`SELECT * FROM ai_picks WHERE game_id = ${gameId} ORDER BY season, week, game_id`;
  }
  if (Number.isFinite(season) && Number.isFinite(week)) {
    return sql`SELECT * FROM ai_picks WHERE season = ${season} AND week = ${week} ORDER BY game_id`;
  }
  if (Number.isFinite(season)) {
    return sql`SELECT * FROM ai_picks WHERE season = ${season} ORDER BY week, game_id`;
  }
  return sql`SELECT * FROM ai_picks ORDER BY season DESC, week DESC, game_id LIMIT 500`;
}

module.exports = { persistAiPicks, listAiPicks, pickPayload };
