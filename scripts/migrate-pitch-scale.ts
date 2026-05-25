/**
 * migrate-pitch-scale.ts
 *
 * One-time migration: fix pitch_sl and pitch_cb values that were stored on
 * a 0-100 velocity scale instead of the correct 0-7 bucket scale.
 *
 * Affected leagues: any dynasty seeded before the AAC / Mountain West / WCC
 * roster files were corrected to use 1-7 pitch-level values.  The broken
 * teams included Tulane, Dallas Baptist, Wichita State, East Carolina,
 * San Diego State, Fresno State, UNLV, Gonzaga, Pepperdine, and Saint Mary's
 * (plus other MWC members: Nevada, Air Force, New Mexico).
 *
 * Bucket mapping — exact match of bucketFromVelocityScale in server/pitchMixHelpers.ts:
 *   raw >= 80  →  7
 *   raw >= 70  →  6
 *   raw >= 60  →  5
 *   raw >= 50  →  4
 *   raw >= 40  →  3
 *   raw >= 30  →  2
 *   raw >= 1   →  1   (1–29 on velocity scale = very weak pitch)
 *   raw <= 0   →  0   (no pitch)
 *
 * Safe to re-run: WHERE clause limits updates to rows where pitch_sl > 7 or
 * pitch_cb > 7, so already-correct rows are never touched.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Exact match of bucketFromVelocityScale from server/pitchMixHelpers.ts
function bucketSql(column: string): string {
  return `
    CASE
      WHEN ${column} >= 80 THEN 7
      WHEN ${column} >= 70 THEN 6
      WHEN ${column} >= 60 THEN 5
      WHEN ${column} >= 50 THEN 4
      WHEN ${column} >= 40 THEN 3
      WHEN ${column} >= 30 THEN 2
      WHEN ${column} >= 1  THEN 1
      ELSE 0
    END
  `.trim();
}

// All teams known to have been affected by the wrong velocity scale.
// Scoping updates to these teams avoids mutating unrelated rows that may
// have reached > 7 through an entirely different bug path.
const AFFECTED_TEAMS = [
  // AAC
  "Tulane", "Dallas Baptist", "Wichita State", "East Carolina",
  "Houston", "UCF", "Memphis", "South Florida", "Cincinnati",
  "Rice", "Tulsa", "Charlotte", "North Texas", "UAB", "Navy",
  // Mountain West (now in Pac-12 in this game)
  "Fresno State", "San Diego State", "UNLV",
  "Nevada", "Air Force", "New Mexico",
  // WCC
  "Gonzaga", "Pepperdine", "Saint Mary's",
  "BYU", "Santa Clara", "San Francisco", "Pacific", "Portland",
].map(name => `'${name.replace(/'/g, "''")}'`).join(", ");

const TEAM_FILTER = `
  EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = players.team_id
      AND t.name IN (${AFFECTED_TEAMS})
  )
`;

async function run() {
  console.log("migrate-pitch-scale: fixing pitch_sl / pitch_cb values > 7 for affected teams...\n");

  const slResult = await db.execute(sql.raw(`
    UPDATE players
    SET pitch_sl = ${bucketSql("pitch_sl")}
    WHERE pitch_sl > 7
      AND ${TEAM_FILTER}
  `));
  console.log(`  pitch_sl: ${slResult.rowCount ?? 0} row(s) updated`);

  const cbResult = await db.execute(sql.raw(`
    UPDATE players
    SET pitch_cb = ${bucketSql("pitch_cb")}
    WHERE pitch_cb > 7
      AND ${TEAM_FILTER}
  `));
  console.log(`  pitch_cb: ${cbResult.rowCount ?? 0} row(s) updated`);

  const verify = await db.execute(sql.raw(`
    SELECT
      COUNT(*) FILTER (WHERE pitch_sl > 7) AS bad_sl,
      COUNT(*) FILTER (WHERE pitch_cb > 7) AS bad_cb
    FROM players
    WHERE position = 'P'
  `));

  const row = verify.rows[0] as { bad_sl: string; bad_cb: string };
  const badSl = parseInt(row.bad_sl, 10);
  const badCb = parseInt(row.bad_cb, 10);

  if (badSl > 0 || badCb > 0) {
    console.error(`\n✗ Remaining violations: pitch_sl=${badSl} pitch_cb=${badCb}`);
    process.exit(1);
  }

  console.log("\n✓ All pitch_sl and pitch_cb values are now in the 0-7 range.");
  await pool.end();
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
