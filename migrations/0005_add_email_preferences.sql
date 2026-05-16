ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS email_digests_enabled boolean NOT NULL DEFAULT true;
