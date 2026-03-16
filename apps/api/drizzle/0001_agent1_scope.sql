ALTER TABLE story_arcs
  ADD COLUMN IF NOT EXISTS chapter_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS job_payload JSONB;

ALTER TABLE comic_strips
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS panel_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS composed_strip_asset_path TEXT,
  ADD COLUMN IF NOT EXISTS failure_code TEXT;

ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS public_asset_path TEXT,
  ADD COLUMN IF NOT EXISTS public_asset_url TEXT;

CREATE TABLE IF NOT EXISTS weekly_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iso_week TEXT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  issue_title TEXT NOT NULL,
  arc_summary TEXT NOT NULL,
  cover_image_url TEXT,
  strip_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  torn_page_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'in_progress',
  compiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, iso_week)
);

CREATE TABLE IF NOT EXISTS torn_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_issue_id UUID NOT NULL REFERENCES weekly_issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked',
  unlock_challenge JSONB NOT NULL,
  unlock_response TEXT,
  retroactive_strip_id UUID REFERENCES comic_strips(id),
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);
