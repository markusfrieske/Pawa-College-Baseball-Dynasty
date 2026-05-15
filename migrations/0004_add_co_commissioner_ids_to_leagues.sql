ALTER TABLE leagues ADD COLUMN IF NOT EXISTS co_commissioner_ids json NOT NULL DEFAULT '[]';
