'use strict';

function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickPayload(card) {
  const ai = card.aiPick || {};
  const confidence = numOrNull(ai.confidence);
  const atsConfidence = numOrNull(ai.atsConfidence != null ? ai.atsConfidence : ai.confidence);
  const ouConfidence = numOrNull(ai.ouConfidence);
  const rawConfidence = numOrNull(ai.rawConfidence != null ? ai.rawConfidence : ai.rawAtsConfidence);
  const rawOuConfidence = numOrNull(ai.rawOuConfidence);
  return {
    ats: ai.ats || null,
    ou: ai.ou || null,
    ouText: ai.ouText || null,
    ml: ai.ml || null,
    mlTeam: ai.mlTeam || null,
    atsMarket: ai.atsMarket || null,
    atsNote: ai.atsNote || null,
    ouNote: ai.ouNote || null,
    label: ai.label || null,
    expected: ai.expected || null,
    confidence,
    atsConfidence,
    ouConfidence,
    rawConfidence,
    rawAtsConfidence: rawConfidence,
    rawOuConfidence,
    atsTeam: ai.atsTeam || null,
    home_team: card.home_team,
    away_team: card.away_team,
    spread_line: card.spread_line == null ? null : Number(card.spread_line),
    total_line: card.total_line == null ? null : Number(card.total_line)
  };
}

function parsePayload(payload) {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
}

/** Rebuild the served AI pick from a stored snapshot. Does not recompute. */
function pickFromPayload(payload) {
  const p = parsePayload(payload);
  if (!p || typeof p !== 'object') return null;
  const confidence = numOrNull(p.confidence);
  const atsConfidence = numOrNull(p.atsConfidence != null ? p.atsConfidence : p.confidence);
  const rawConfidence = numOrNull(p.rawConfidence != null ? p.rawConfidence : p.rawAtsConfidence);
  return {
    ats: p.ats || null,
    ou: p.ou || null,
    ouText: p.ouText || null,
    ml: p.ml || null,
    mlTeam: p.mlTeam || null,
    atsMarket: p.atsMarket || null,
    atsNote: p.atsNote || null,
    ouNote: p.ouNote || null,
    label: p.label || null,
    expected: p.expected || null,
    confidence,
    atsConfidence,
    ouConfidence: numOrNull(p.ouConfidence),
    rawConfidence,
    rawAtsConfidence: rawConfidence,
    rawOuConfidence: numOrNull(p.rawOuConfidence),
    atsTeam: p.atsTeam || null
  };
}

/**
 * Locked games keep the last pregame snapshot. A row with frozen_at is never
 * replaced. An unlocked game keeps the freshly computed pick.
 */
function applyAiSnapshots(cards, rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (row && row.game_id) byId.set(row.game_id, row);
  }
  return (cards || []).map((card) => {
    if (!card || !card.game_id) return card;
    const row = byId.get(card.game_id);
    const stored = row ? pickFromPayload(row.payload) : null;
    if (row && row.frozen_at && stored) {
      return { ...card, aiPick: stored, aiPickFrozen: true };
    }
    if (card.locked && stored) {
      return { ...card, aiPick: stored, aiPickFreezeNow: true };
    }
    if (card.locked) {
      return { ...card, aiPickFreezeNow: true };
    }
    return card;
  });
}

function decidePersist(card) {
  if (!card || !card.game_id || !card.aiPick) return { action: 'skip' };
  if (card.aiPickFrozen) return { action: 'skip', reason: 'frozen' };
  return { action: 'upsert', freeze: Boolean(card.locked || card.aiPickFreezeNow) };
}

async function persistAiPicks(sql, cards) {
  if (!sql || !Array.isArray(cards) || !cards.length) return { ok: true, saved: 0 };
  let saved = 0;
  for (const card of cards) {
    const decision = decidePersist(card);
    if (decision.action !== 'upsert') continue;
    const payload = pickPayload(card);
    const generatedAt = new Date().toISOString();
    const frozenAt = decision.freeze ? generatedAt : null;
    // Do not overwrite a frozen snapshot. Pregame rows may update until lock;
    // the lock write sets frozen_at once and later writes no-op.
    await sql`
      INSERT INTO ai_picks (
        game_id, season, week, home_team, away_team, spread_line, total_line, payload, generated_at, updated_at, frozen_at
      ) VALUES (
        ${card.game_id}, ${card.season}, ${card.week}, ${card.home_team}, ${card.away_team},
        ${card.spread_line}, ${card.total_line}, ${payload}, ${generatedAt}::timestamptz, now(),
        ${frozenAt}::timestamptz
      )
      ON CONFLICT (game_id) DO UPDATE SET
        season = EXCLUDED.season,
        week = EXCLUDED.week,
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        spread_line = EXCLUDED.spread_line,
        total_line = EXCLUDED.total_line,
        payload = EXCLUDED.payload,
        generated_at = CASE
          WHEN ai_picks.frozen_at IS NULL AND EXCLUDED.frozen_at IS NOT NULL THEN ai_picks.generated_at
          ELSE EXCLUDED.generated_at
        END,
        updated_at = now(),
        frozen_at = COALESCE(ai_picks.frozen_at, EXCLUDED.frozen_at)
      WHERE ai_picks.frozen_at IS NULL
        AND (
          ai_picks.payload IS DISTINCT FROM EXCLUDED.payload
          OR EXCLUDED.frozen_at IS NOT NULL
        )
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

module.exports = {
  persistAiPicks,
  listAiPicks,
  pickPayload,
  pickFromPayload,
  applyAiSnapshots,
  decidePersist
};
