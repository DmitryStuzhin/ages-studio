// Схема создаётся идемпотентно при старте. Для продакшена с миграциями — drizzle-kit (см. README).
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS prompt_versions (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  constitution TEXT NOT NULL,
  steps JSONB NOT NULL,
  changelog TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'archived',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prompt_proposals (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  source_project_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  confirmations INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'hypothesis',
  scope TEXT NOT NULL DEFAULT 'long',
  source_project_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  legacy BOOLEAN NOT NULL DEFAULT false,
  format TEXT NOT NULL DEFAULT 'survive24',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_version_id INTEGER,
  parent_id INTEGER,
  youtube_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS step_runs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  prompt TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  model TEXT,
  gates JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS step_runs_project_step ON step_runs(project_id, step_key);
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  views INTEGER,
  browse_views INTEGER,
  shorts_views INTEGER,
  ctr REAL,
  avg_view_pct REAL,
  avg_view_sec INTEGER,
  subs_gained INTEGER,
  watch_hours REAL,
  engaged_pct REAL,
  retention JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS channel_snapshots (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL,
  subscribers INTEGER NOT NULL,
  watch_hours_12m REAL,
  shorts_views_90d INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS market_items (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  channel TEXT,
  url TEXT,
  views INTEGER,
  published_at DATE,
  angle TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS market_items_external ON market_items(external_id);
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS channel_videos (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  duration_sec INTEGER,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  is_short BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id SERIAL PRIMARY KEY,
  trigger TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok BOOLEAN,
  quota_units INTEGER NOT NULL DEFAULT 0,
  log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS metrics_api_unique ON metrics(project_id, day) WHERE source = 'api';
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS channel_subs INTEGER;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS duration_sec INTEGER;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS likes INTEGER;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS comments INTEGER;
CREATE TABLE IF NOT EXISTS video_history (
  video_id TEXT NOT NULL,
  day DATE NOT NULL,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  PRIMARY KEY (video_id, day)
);
CREATE TABLE IF NOT EXISTS channel_reports (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;
