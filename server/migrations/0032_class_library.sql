-- 0032: Versioned recruiting class library, AI class jobs

CREATE TABLE IF NOT EXISTS recruiting_class_projects (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id varchar NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  current_draft_revision integer NOT NULL DEFAULT 0,
  class_data json,
  source_class_id varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiting_class_projects_owner ON recruiting_class_projects (owner_user_id);

CREATE TABLE IF NOT EXISTS recruiting_class_versions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES recruiting_class_projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  package_json json NOT NULL,
  content_hash text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  is_sealed boolean NOT NULL DEFAULT false,
  published_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiting_class_versions_project ON recruiting_class_versions (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcs_token_hash ON recruiting_class_shares (token_hash) WHERE token_hash IS NOT NULL;

ALTER TABLE recruiting_class_shares ADD CONSTRAINT IF NOT EXISTS fk_rcs_version_id
  FOREIGN KEY (version_id) REFERENCES recruiting_class_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ai_class_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES recruiting_class_projects(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id),
  job_type text NOT NULL,
  prompt text,
  model_identifier text,
  schema_version integer NOT NULL DEFAULT 1,
  response_json jsonb,
  fallback_json jsonb,
  status text NOT NULL DEFAULT 'pending',
  accepted_at timestamp,
  rejected_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_class_jobs_project ON ai_class_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_ai_class_jobs_user_created ON ai_class_jobs (user_id, created_at);
