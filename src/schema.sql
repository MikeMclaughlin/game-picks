-- NFL pick-em schema (Neon Postgres). Idempotent.
-- Default import covers 2016 through the current season; --from-2010 still works.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  username_norm TEXT NOT NULL,
  clerk_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pool_id, username_norm)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_uidx
  ON users (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS games (
  game_id TEXT PRIMARY KEY,
  season INT NOT NULL,
  week INT NOT NULL,
  game_type TEXT NOT NULL,
  kickoff TIMESTAMPTZ NOT NULL,
  gameday DATE,
  weekday TEXT,
  gametime TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INT,
  away_score INT,
  spread_line NUMERIC,
  total_line NUMERIC,
  spread_open NUMERIC,
  total_open NUMERIC,
  spread_open_at TIMESTAMPTZ,
  total_open_at TIMESTAMPTZ,
  home_rest INT,
  away_rest INT,
  roof TEXT,
  surface TEXT,
  temp NUMERIC,
  wind NUMERIC,
  location TEXT,
  overtime INT,
  home_qb_name TEXT,
  away_qb_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_season_week_kickoff_idx
  ON games (season, week, kickoff);

CREATE INDEX IF NOT EXISTS games_teams_idx
  ON games (home_team, away_team, kickoff);

ALTER TABLE games ADD COLUMN IF NOT EXISTS spread_open NUMERIC;
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_open NUMERIC;
ALTER TABLE games ADD COLUMN IF NOT EXISTS spread_open_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS total_open_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_qb_name TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_qb_name TEXT;

UPDATE games
SET
  spread_open = spread_line,
  spread_open_at = COALESCE(spread_open_at, updated_at)
WHERE spread_open IS NULL AND spread_line IS NOT NULL;

UPDATE games
SET
  total_open = total_line,
  total_open_at = COALESCE(total_open_at, updated_at)
WHERE total_open IS NULL AND total_line IS NOT NULL;

CREATE TABLE IF NOT EXISTS wagers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  market TEXT NOT NULL CHECK (market IN ('outright', 'ats', 'ou')),
  selection TEXT NOT NULL,
  line_at_pick NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id, market)
);

CREATE INDEX IF NOT EXISTS wagers_user_idx ON wagers (user_id);
CREATE INDEX IF NOT EXISTS wagers_game_idx ON wagers (game_id);

CREATE TABLE IF NOT EXISTS wager_results (
  wager_id UUID PRIMARY KEY REFERENCES wagers(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'push', 'ungraded')),
  points INT NOT NULL DEFAULT 0,
  graded_at TIMESTAMPTZ,
  home_score INT,
  away_score INT,
  spread_line NUMERIC,
  total_line NUMERIC
);

CREATE TABLE IF NOT EXISTS wager_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wager_id UUID NOT NULL REFERENCES wagers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  game_id TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  line_at_pick NUMERIC,
  action TEXT NOT NULL,
  result TEXT,
  points INT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wager_history_wager_idx ON wager_history (wager_id, at);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_picks (
  game_id TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
  season INT NOT NULL,
  week INT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  spread_line NUMERIC,
  total_line NUMERIC,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_at TIMESTAMPTZ
);

ALTER TABLE ai_picks ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_picks_season_week_idx ON ai_picks (season, week);

INSERT INTO pools (slug, name)
VALUES ('default', 'Season Pick-Em')
ON CONFLICT (slug) DO NOTHING;
