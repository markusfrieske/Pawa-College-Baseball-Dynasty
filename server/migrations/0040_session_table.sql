-- 0040: connect-pg-simple session store table
-- Extracted from registerRoutes() in server/routes.ts so all schema DDL lives
-- only in numbered migrations and is never executed inline during request setup.

CREATE TABLE IF NOT EXISTS session (
  sid    varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess   json    NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
