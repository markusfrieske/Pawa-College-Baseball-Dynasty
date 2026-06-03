ALTER TABLE "players" ADD COLUMN "last_pitched_outs" integer NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "last_pitched_week" integer;
ALTER TABLE "players" ADD COLUMN "last_pitched_day" text;
