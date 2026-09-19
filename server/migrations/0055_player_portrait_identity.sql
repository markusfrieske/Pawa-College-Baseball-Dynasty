-- Optional explicit identity: no legacy faces or saves are remapped.
ALTER TABLE players ADD COLUMN IF NOT EXISTS portrait_id text
  CHECK (portrait_id IS NULL OR portrait_id ~ '^c9-face-(0[1-9]|[12][0-9]|30)$');
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS portrait_id text
  CHECK (portrait_id IS NULL OR portrait_id ~ '^c9-face-(0[1-9]|[12][0-9]|30)$');
ALTER TABLE walkon_pool ADD COLUMN IF NOT EXISTS portrait_id text
  CHECK (portrait_id IS NULL OR portrait_id ~ '^c9-face-(0[1-9]|[12][0-9]|30)$');
