CREATE TABLE IF NOT EXISTS "recruiting_class_shares" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" varchar NOT NULL REFERENCES "saved_recruiting_classes"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "token" text NOT NULL UNIQUE,
  "label" text,
  "status" text DEFAULT 'active' NOT NULL,
  "import_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "recruiting_class_shares_token_idx" ON "recruiting_class_shares"("token");
CREATE INDEX IF NOT EXISTS "recruiting_class_shares_class_id_idx" ON "recruiting_class_shares"("class_id");
