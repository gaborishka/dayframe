CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at TIMESTAMPTZ,
  preferences JSONB NOT NULL DEFAULT '{"comic_style":"adventure","tone":"humorous","language":"en"}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  protagonist JSONB NOT NULL,
  world_setting TEXT NOT NULL,
  active_threads JSONB NOT NULL DEFAULT '[]'::jsonb,
  recurring_characters JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_arc_hooks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS day_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  timezone TEXT NOT NULL,
  calendar_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  todo_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  reflection TEXT,
  source_status JSONB NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  current_stage_retry_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  trigger_source TEXT NOT NULL,
  leased_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  last_completed_stage TEXT,
  next_retry_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  result_strip_id UUID,
  result_weekly_issue_id UUID,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_script JSONB,
  panel_assets JSONB,
  composed_strip_svg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generation_jobs_queue_idx
  ON generation_jobs (status, next_retry_at, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS comic_scripts (
  id UUID PRIMARY KEY,
  day_context_id UUID NOT NULL REFERENCES day_contexts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comic_strips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_context_id UUID NOT NULL REFERENCES day_contexts(id) ON DELETE CASCADE,
  comic_script_id UUID NOT NULL REFERENCES comic_scripts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  title TEXT NOT NULL,
  tone TEXT NOT NULL,
  panels JSONB NOT NULL,
  characters JSONB NOT NULL,
  arc_hooks JSONB NOT NULL,
  generation_metadata JSONB NOT NULL,
  composed_svg TEXT NOT NULL,
  superseded_by UUID REFERENCES comic_strips(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comic_strips_user_date_idx
  ON comic_strips (user_id, date, created_at DESC);

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_strip_id UUID NOT NULL REFERENCES comic_strips(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
