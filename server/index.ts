import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer, request as httpRequest } from "http";
import { pool } from "./db";
import { calculateOVR, getStarRatingFromOVR } from "../shared/abilities";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Cache-busting headers for development only
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run all idempotent column-addition migrations in parallel to minimize cold-start time.
  await Promise.allSettled([
    pool.query("ALTER TABLE leagues ADD COLUMN IF NOT EXISTS phase_deadline TIMESTAMP"),
    pool.query("ALTER TABLE league_events ADD COLUMN IF NOT EXISTS metadata jsonb"),
    pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_name text"),
    pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_ovr integer"),
    pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_stars integer"),
    pool.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb"),
    pool.query("ALTER TABLE recruits ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb"),
    pool.query("ALTER TABLE player_history ADD COLUMN IF NOT EXISTS source_player_id varchar"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS national_rank integer NOT NULL DEFAULT 149"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_national_rank integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS recruiting_rank_boost real NOT NULL DEFAULT 0"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_prestige integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_facilities integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_academics integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_stadium integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prev_college_life integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS prestige_baseline integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS facilities_baseline integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS academics_baseline integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS stadium_baseline integer"),
    pool.query("ALTER TABLE teams ADD COLUMN IF NOT EXISTS college_life_baseline integer"),
    pool.query("ALTER TABLE recruits ADD COLUMN IF NOT EXISTS nil_cost integer NOT NULL DEFAULT 0"),
    pool.query("ALTER TABLE leagues ADD COLUMN IF NOT EXISTS show_ready_names_to_all boolean NOT NULL DEFAULT false"),
    pool.query(`CREATE TABLE IF NOT EXISTS session (sid varchar NOT NULL COLLATE "default" PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL)`),
  ]).then(results => {
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      failed.forEach(r => console.warn("[startup-migration] column add failed:", (r as PromiseRejectedResult).reason));
    }
  });

  // ── Sequential Startup Migration Runner ──────────────────────────────────────
  // All one-time startup migrations run inside a single async IIFE, in order.
  //
  // WHY SEQUENTIAL: the old parallel-IIFE design had two race conditions:
  //   1. Table-not-found — later migrations tried SELECT from _startup_migrations
  //      before an earlier IIFE's CREATE TABLE completed, causing silent failures.
  //   2. getRealRosters contention — concurrent callers made the large dynamic
  //      import hang under heavy startup DB load (e.g. the e2e test spinning up).
  //
  // With a sequential runner the table is guaranteed to exist before any migration
  // body runs, and getRealRosters() is called at most once at a time.
  void (async () => {
    try {
      // Create the guard table once, before any migration body executes.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _startup_migrations (
          key text PRIMARY KEY,
          ran_at timestamp DEFAULT now()
        )
      `);

      // once(): insert-first guard — marks the migration done BEFORE running it.
      // Use for idempotent operations where a partial run leaves no harmful state.
      // Per-step try/catch ensures one failing migration never blocks subsequent ones.
      async function once(key: string, fn: () => Promise<void>): Promise<void> {
        try {
          const { rows } = await pool.query<{ key: string }>(
            `INSERT INTO _startup_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key`,
            [key],
          );
          if (rows.length === 0) return; // already ran
          await fn();
        } catch (e) {
          console.error(`[startup-migration] ${key} failed:`, e);
        }
      }

      // onceAfter(): mark-after guard — key inserted only on success.
      // Use for operations that may fail partway through and need to retry.
      // Per-step try/catch ensures one failing migration never blocks subsequent ones.
      async function onceAfter(key: string, fn: () => Promise<void>): Promise<void> {
        try {
          const { rows } = await pool.query<{ key: string }>(
            `SELECT key FROM _startup_migrations WHERE key = $1`,
            [key],
          );
          if (rows.length > 0) return; // already ran
          await fn();
          await pool.query(
            `INSERT INTO _startup_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
            [key],
          );
        } catch (e) {
          console.error(`[startup-migration] ${key} failed:`, e);
        }
      }

      // ── drop-pitch-ch-binary-v1 ────────────────────────────────────────────
      // Drop binary CHECK constraints on pitch_ch so it can hold values 1-7.
      await once('drop-pitch-ch-binary-v1', async () => {
        await pool.query("ALTER TABLE players  DROP CONSTRAINT IF EXISTS players_pitch_ch_binary");
        await pool.query("ALTER TABLE recruits DROP CONSTRAINT IF EXISTS recruits_pitch_ch_binary");
        console.log("[startup-migration] drop-pitch-ch-binary-v1: pitch_ch binary constraints dropped");
      });

      // ── pitch-spl-to-vsl-v1 ───────────────────────────────────────────────
      // When Task #1133 renamed Splitter → Vertical Slider, the pitchMix() helper
      // in roster files still mapped index-6 to pitch_spl. This migrates existing
      // dynasty players so pitch_spl values move to pitch_vsl in-place.
      await once('pitch-spl-to-vsl-v1', async () => {
        const result = await pool.query(`
          UPDATE players
          SET pitch_vsl = pitch_spl, pitch_spl = 0
          WHERE pitch_spl > 0 AND pitch_vsl = 0
        `);
        console.log(`[startup-migration] pitch-spl-to-vsl-v1: migrated ${result.rowCount} player(s)`);
      });

      // ── pitcher-stamina-bands-v1 ───────────────────────────────────────────
      // Role-based stamina bands: starters 80-99, long relief 50-79,
      // mid relief 30-49, closer 1-29.
      await once('pitcher-stamina-bands-v1', async () => {
        const { rows: pitchers } = await pool.query<{ id: number; team_id: number }>(
          `SELECT id, team_id FROM players WHERE position IN ('P','SP','RP','CP') ORDER BY team_id, id`
        );
        function randBand(min: number, max: number) {
          return min + Math.floor(Math.random() * (max - min + 1));
        }
        function staminaForRank(rank: number, total: number): number {
          if (rank <= 4) return randBand(80, 99);
          if (rank === 5) return randBand(50, 79);
          if (rank === total) return randBand(1, 29);
          return randBand(30, 49);
        }
        const byTeam = new Map<number, Array<{ id: number }>>();
        for (const p of pitchers) {
          const arr = byTeam.get(p.team_id) ?? [];
          arr.push({ id: p.id });
          byTeam.set(p.team_id, arr);
        }
        let updated = 0;
        for (const [, teamPitchers] of byTeam) {
          const total = teamPitchers.length;
          for (let i = 0; i < total; i++) {
            const stamina = staminaForRank(i + 1, total);
            await pool.query(`UPDATE players SET stamina = $1 WHERE id = $2`, [stamina, teamPitchers[i].id]);
            updated++;
          }
        }
        console.log(`[startup-migration] pitcher-stamina-bands-v1: updated ${updated} pitchers`);
      });

      // ── real-roster-pitch-sync-v1 (superseded — mark done, no-op body) ────
      await pool.query(
        `INSERT INTO _startup_migrations (key) VALUES ('real-roster-pitch-sync-v1') ON CONFLICT (key) DO NOTHING`
      );

      // ── real-roster-pitch-sync-v2/v3 (superseded — mark done, no-op body) ──
      // v2 and v3 originally called getRealRosters() to do a full pitch sync.
      // That call hangs under startup DB load — the same concurrency problem the
      // sequential runner was designed to fix, but which persists because the
      // dynamic import itself blocks on heavy I/O.  Both migrations are fully
      // superseded by v4 (Aidan King targeted fix) and v5 (Glauber + spl
      // retirement), which are pure-SQL and always complete.  All known bad
      // pitch values are handled by those targeted fixes, so recording v2/v3 as
      // done without running their bodies is safe.
      await pool.query(
        `INSERT INTO _startup_migrations (key) VALUES ('real-roster-pitch-sync-v2') ON CONFLICT (key) DO NOTHING`
      );
      await pool.query(
        `INSERT INTO _startup_migrations (key) VALUES ('real-roster-pitch-sync-v3') ON CONFLICT (key) DO NOTHING`
      );
      console.log("[startup-migration] real-roster-pitch-sync-v2/v3: recorded as done (superseded by v4/v5 pure-SQL fixes)");

      // ── real-roster-pitch-sync-v4 ─────────────────────────────────────────
      // Targeted fix for Aidan King (Florida) — pure SQL, no getRealRosters.
      await onceAfter('real-roster-pitch-sync-v4', async () => {
        const { rowCount: aidanFix } = await pool.query(`
          UPDATE players SET pitch_vsl = 4
          WHERE first_name = 'Aidan' AND last_name = 'King'
            AND position = 'P' AND pitch_vsl != 4
        `);
        console.log(`[startup-migration] real-roster-pitch-sync-v4: Aidan King pitch_vsl fixed for ${aidanFix ?? 0} row(s)`);
      });

      // ── real-roster-pitch-sync-v5 ─────────────────────────────────────────
      // Targeted pitchVSL fix for known players + global pitch_spl retirement.
      // Pure SQL — no getRealRosters call needed.
      await onceAfter('real-roster-pitch-sync-v5', async () => {
        const { rowCount: splCleared } = await pool.query(`
          UPDATE players SET pitch_spl = 0
          WHERE position IN ('P', 'SP', 'RP', 'CP') AND pitch_spl IS DISTINCT FROM 0
        `);
        const { rowCount: aidanFix } = await pool.query(`
          UPDATE players SET pitch_vsl = 4
          WHERE first_name = 'Aidan' AND last_name = 'King'
            AND position = 'P' AND (pitch_vsl IS NULL OR pitch_vsl != 4)
        `);
        const { rowCount: glauberFix } = await pool.query(`
          UPDATE players SET pitch_vsl = 4
          WHERE first_name = 'Caden' AND last_name = 'Glauber'
            AND position = 'P' AND (pitch_vsl IS NULL OR pitch_vsl != 4)
        `);
        console.log(
          `[startup-migration] real-roster-pitch-sync-v5: ` +
          `Aidan King fixed=${aidanFix ?? 0}, Glauber fixed=${glauberFix ?? 0}, ` +
          `pitch_spl cleared=${splCleared ?? 0}`
        );
      });

    } catch (e) {
      console.error("[startup-migrations] sequential runner failed:", e);
    }
  })();

  // v6: Full pitchVSL sync for all ~545 real-roster pitchers.
  // Previous v2/v3 attempts used getRealRosters() (dynamic import) and failed
  // silently under startup DB load. This version embeds the canonical pitchVSL
  // values as a static lookup table — no dynamic import, no concurrency risk.
  // Matches players by first_name + last_name + position + team name, then
  // updates pitch_vsl wherever the stored value diverges from the source.
  void (async () => {
    try {
      const { rows: check } = await pool.query<{ key: string }>(`
        SELECT key FROM _startup_migrations WHERE key = 'real-roster-pitch-sync-v6'
      `);
      if (check.length > 0) return;

      // Static map of "firstName|lastName|position|teamName" -> pitchVSL.
      // Generated directly from all roster source files (secBatch1-3, accBatch1-3,
      // bigTenBatch1-3, big12Rosters, pac12Rosters, aacRosters, sunBeltRosters,
      // wccRosters, bigWestRosters, moValleyRosters, ivyLeagueRosters, hbcuRosters).
      const PITCH_VSL_MAP: Record<string, number> = {
        "Cooper|Moore|P|LSU": 3,
        "William|Schmidt|P|LSU": 4,
        "Zac|Cowan|P|LSU": 3,
        "Aidan|King|P|Florida": 4,
        "Liam|Peterson|P|Florida": 4,
        "Jackson|Barberi|P|Florida": 4,
        "Christian|Rodriguez|P|Florida": 4,
        "Cooper|Walls|P|Florida": 4,
        "Blaine|Rowland|P|Florida": 4,
        "Connor|Fennell|P|Vanderbilt": 4,
        "Nate|Taylor|P|Vanderbilt": 4,
        "Miller|Green|P|Vanderbilt": 4,
        "Patrick|Reilly|P|Vanderbilt": 4,
        "Jakob|Schulz|P|Vanderbilt": 3,
        "Drew|Beam|P|Vanderbilt": 4,
        "Shane|Sdao|P|Texas A&M": 4,
        "Weston|Moss|P|Texas A&M": 4,
        "Juan|Vargas|P|Texas A&M": 4,
        "Grant|Cunningham|P|Texas A&M": 4,
        "Tegan|Kuhns|P|Tennessee": 4,
        "Landon|Mack|P|Tennessee": 4,
        "Evan|Blanco|P|Tennessee": 4,
        "Brandon|Arvidson|P|Tennessee": 4,
        "Tyler|Keele|P|Tennessee": 3,
        "Dalton|Rogers|P|Tennessee": 4,
        "Cade|Townsend|P|Ole Miss": 4,
        "Taylor|Rabe|P|Ole Miss": 4,
        "Aiden|Sims|P|Ole Miss": 4,
        "Hudson|Calhoun|P|Ole Miss": 4,
        "Grayson|Saunier|P|Ole Miss": 4,
        "Colin|Fisher|P|Arkansas": 4,
        "Ethan|McElvain|P|Arkansas": 4,
        "Hunter|Dietz|P|Arkansas": 4,
        "Steele|Eaves|P|Arkansas": 4,
        "James|DeCremer|P|Arkansas": 4,
        "Zane|Adams|P|Alabama": 4,
        "Owen|Sarna|P|Alabama": 4,
        "Bobby|Alcock|P|Alabama": 4,
        "Hagan|Banks|P|Alabama": 4,
        "Ashton|Crowther|P|Alabama": 4,
        "Luke|Smyers|P|Alabama": 4,
        "Drew|Whalen|P|Auburn": 4,
        "Jake|Marciano|P|Auburn": 4,
        "Garrett|Brewer|P|Auburn": 4,
        "Alex|Petrovic|P|Auburn": 4,
        "Mason|Barnett|P|Auburn": 4,
        "Andreas|Alvarez|P|Auburn": 4,
        "Joey|Volchko|P|Georgia": 4,
        "Dylan|Vigue|P|Georgia": 4,
        "Matt|Scott|P|Georgia": 4,
        "Duke|Stone|P|Mississippi State": 4,
        "Tyler|Pitzer|P|Mississippi State": 4,
        "Jackson|Logar|P|Mississippi State": 4,
        "Jack|Bauer|P|Mississippi State": 4,
        "Maddox|Miller|P|Mississippi State": 4,
        "Brandon|Stone|P|South Carolina": 4,
        "Amp|Phillips|P|South Carolina": 4,
        "Marcus|Hall|P|South Carolina": 4,
        "Zach|Swanson|P|South Carolina": 4,
        "Dylan|Reeves|P|South Carolina": 3,
        "Trevor|Mack|P|South Carolina": 4,
        "Jaxon|Jelkin|P|Kentucky": 4,
        "Nate|Harris|P|Kentucky": 4,
        "Tommy|Skelding|P|Kentucky": 4,
        "Chase|Alderman|P|Kentucky": 4,
        "Mason|Wright|P|Kentucky": 4,
        "Gavin|Porter|P|Kentucky": 3,
        "Brady|Kehlenbrink|P|Missouri": 4,
        "Tyler|Stokes|P|Missouri": 4,
        "Drew|Walters|P|Missouri": 4,
        "Landon|Price|P|Missouri": 4,
        "Jake|Donaldson|P|Missouri": 3,
        "LJ|Mercurius|P|Oklahoma": 4,
        "Cord|Rager|P|Oklahoma": 4,
        "Kadyn|Leon|P|Oklahoma": 4,
        "Reid|Hensley|P|Oklahoma": 4,
        "Mason|Bixby|P|Oklahoma": 4,
        "Dylan|Volantis|P|Texas": 4,
        "Ruger|Riojas|P|Texas": 4,
        "Thomas|Burns|P|Texas": 4,
        "Sam|Cozart|P|Texas": 4,
        "Haiden|Leffew|P|Texas": 4,
        "Kade|Bing|P|Texas": 4,
        "Cal|Higgins|P|Texas": 3,
        "Cole|Stokes|P|Clemson": 3,
        "Talan|Bell|P|Clemson": 4,
        "Drew|Titsworth|P|Clemson": 4,
        "Camden|Cross|P|Clemson": 4,
        "Aidan|Weaver|P|Duke": 4,
        "Ben|Dean|P|Duke": 4,
        "Marcus|Holloway|P|Duke": 4,
        "Ethan|Brooks|P|Duke": 4,
        "John|Abraham|P|Florida State": 4,
        "Marcus|Harrell|P|Florida State": 4,
        "Wes|Mendes|P|Florida State": 4,
        "Justin|Shadek|P|Georgia Tech": 4,
        "Cooper|Underwood|P|Georgia Tech": 4,
        "Carson|Ballard|P|Georgia Tech": 3,
        "Iyan|Wilson|P|Georgia Tech": 4,
        "Cade|Brown|P|Georgia Tech": 3,
        "Wyatt|Danilowicz|P|Louisville": 4,
        "Dominic|Jacoby|P|Louisville": 4,
        "Peter|Michael|P|Louisville": 4,
        "Kade|Elam|P|Louisville": 4,
        "Ryan|Bilka|P|Miami": 4,
        "AJ|Ciscar|P|Miami": 4,
        "TJ|Coats|P|Miami": 4,
        "Marco|Reyes|P|Miami": 4,
        "Tommy|Santiago|P|Miami": 4,
        "Anthony|Perez|P|Miami": 4,
        "Cam|Andrews|P|NC State": 4,
        "Collins|Black|P|NC State": 4,
        "Aiden|Kitchings|P|NC State": 4,
        "Tyler|Barnes|P|NC State": 3,
        "Caden|Glauber|P|North Carolina": 4,
        "Ryan|Lynch|P|North Carolina": 3,
        "Folger|Boaz|P|North Carolina": 4,
        "Jackson|Rose|P|North Carolina": 4,
        "Jack|Radel|P|Notre Dame": 4,
        "Ty|Uber|P|Notre Dame": 4,
        "Noah|Rooney|P|Notre Dame": 4,
        "Chase|Van Ameyde|P|Notre Dame": 3,
        "Dylan|Singleton|P|Notre Dame": 4,
        "Brady|Walsh|P|Notre Dame": 4,
        "David|Leslie|P|Pittsburgh": 4,
        "Drew|Lafferty|P|Pittsburgh": 4,
        "Ryan|Kowalski|P|Pittsburgh": 4,
        "Chris|Varga|P|Pittsburgh": 4,
        "Cole|Clark|P|California": 4,
        "Otto|Espinoza|P|California": 3,
        "Parker|Warner|P|Stanford": 4,
        "Aidan|Keenan|P|Stanford": 3,
        "Drew|Dowd|P|Stanford": 4,
        "David|Wiser|P|Stanford": 4,
        "Colt|Peterson|P|Stanford": 3,
        "Tyler|Kapa|P|Virginia": 4,
        "Joe|Colucci|P|Virginia": 4,
        "Max|Stammel|P|Virginia": 4,
        "Noah|Yoder|P|Virginia": 4,
        "Brett|Renfrow|P|Virginia Tech": 4,
        "Logan|Eisenreich|P|Virginia Tech": 4,
        "Aiden|Robertson|P|Virginia Tech": 4,
        "Noah|Sorrells|P|Virginia Tech": 4,
        "Ethan|Douglas|P|Virginia Tech": 4,
        "Ethan|Grim|P|Virginia Tech": 4,
        "Chris|Levonas|P|Wake Forest": 4,
        "Cameron|Bagwell|P|Wake Forest": 4,
        "Troy|Dressler|P|Wake Forest": 4,
        "Josh|Hartle|P|Wake Forest": 4,
        "Ryan|Brennecke|P|Wake Forest": 3,
        "Brady|Miller|P|Boston College": 4,
        "Drew|Grumbles|P|Boston College": 4,
        "Tyler|Mudd|P|Boston College": 4,
        "Henry|Leake|P|Boston College": 4,
        "Zach|Bates|P|Illinois": 4,
        "Mitch|Dye|P|Illinois": 4,
        "Landon|Yorek|P|Illinois": 4,
        "Liam|McKillop|P|Illinois": 4,
        "Ike|Young|P|Illinois": 3,
        "Aiden|Flinn|P|Illinois": 4,
        "Chase|Linn|P|Indiana": 4,
        "Pete|Haas|P|Indiana": 4,
        "Brayton|Thomas|P|Indiana": 4,
        "Owen|Keiser|P|Indiana": 3,
        "Bryce|Donnelly|P|Indiana": 3,
        "Tyler|Guerin|P|Iowa": 4,
        "Justin|Hackett|P|Iowa": 4,
        "Ganon|Archer|P|Iowa": 4,
        "Derek|Nagel|P|Iowa": 4,
        "Jaron|Bleeker|P|Iowa": 4,
        "Lance|Williams|P|Maryland": 4,
        "Austin|Weiss|P|Maryland": 4,
        "Logan|Hastings|P|Maryland": 4,
        "Brayden|Ryan|P|Maryland": 4,
        "Ryan|Bailey|P|Maryland": 4,
        "Max|Mendez|P|Maryland": 4,
        "Kurt|Barr|P|Michigan": 4,
        "Gavin|DeVooght|P|Michigan": 4,
        "Max|Debiec|P|Michigan": 4,
        "Cade|Montgomery|P|Michigan": 4,
        "Tyler|Bischoff|P|Michigan": 3,
        "Ethan|VanBuskirk|P|Michigan": 4,
        "Gannon|Grundman|P|Michigan State": 4,
        "Josh|Klug|P|Michigan State": 4,
        "Tyler|Hemmesch|P|Minnesota": 4,
        "Will|Whelan|P|Minnesota": 4,
        "Marcus|Kruzan|P|Minnesota": 4,
        "Ben|Gregory|P|Minnesota": 4,
        "Ethan|Felling|P|Minnesota": 4,
        "Ty|Horn|P|Nebraska": 4,
        "Shea|Wendt|P|Nebraska": 4,
        "Kevin|Mannell|P|Nebraska": 4,
        "J.D.|Hennen|P|Nebraska": 4,
        "Garrett|Shearer|P|Northwestern": 4,
        "Matt|Kouser|P|Northwestern": 4,
        "Zach|Erdman|P|Purdue": 3,
        "Rohan|Kasanagottu|P|USC": 1,
        "Hayden|Lewis|P|Washington": 3,
        "Wyatt|Queen|P|Oregon State": 3,
        "Sky|Collins|P|Fresno State": 4,
        "Cody|Wentworth|P|Fresno State": 4,
        "Wyatt|Crowell|P|Fresno State": 4,
        "Brody|Barnum|P|Fresno State": 4,
        "Nate|Romero|P|Fresno State": 4,
        "Marcus|Saavedra|P|Fresno State": 4,
        "Rohan|Lettow|P|San Diego State": 4,
        "Trey|Telfer|P|San Diego State": 4,
        "Aidan|Russell|P|San Diego State": 4,
        "Issac|Araiza|P|San Diego State": 4,
        "Alito|McBean|P|San Diego State": 4,
        "Caden|Takagi|P|UNLV": 4,
        "Brandon|Mejia|P|UNLV": 4,
        "Cooper|Sheff|P|UNLV": 4,
        "Antonio|Avila|P|Nevada": 4,
        "Dayne|Pengelly|P|New Mexico": 4,
        "Ty|Cunningham|P|New Mexico": 4,
        "Ryan|Baca|P|New Mexico": 4,
        "Dylan|Rogers|P|Air Force": 4,
        "Josh|Shropshire|P|Air Force": 4,
        "Gio|Sambito|P|Air Force": 4,
        "Owen|Prescott|P|Columbia": 3,
        "Sam|Whitfield|P|Columbia": 4,
        "Nate|Callahan|P|Columbia": 3,
        "Colin|Barrett|P|Cornell": 4,
        "Liam|Dugan|P|Cornell": 3,
        "Patrick|Chen|P|Cornell": 3,
        "Will|McKenna|P|Dartmouth": 3,
        "Chase|Hodgson|P|Dartmouth": 3,
        "Matt|Archer|P|Dartmouth": 3,
        "Carter|Simms|P|Dartmouth": 2,
        "Matt|Cavanagh|P|Harvard": 4,
        "Ben|Portman|P|Harvard": 4,
        "Luke|Hennessey|P|Harvard": 4,
        "Mike|Gallagher|P|Penn": 4,
        "Tyler|Brock|P|Penn": 4,
        "Chris|Navarro|P|Penn": 4,
        "Ryan|Keane|P|Penn": 4,
        "Nick|Santora|P|Penn": 3,
        "Cole|Richter|P|Penn": 2,
        "Will|Stratton|P|Princeton": 3,
        "Ian|Coughlin|P|Princeton": 4,
        "Matt|Delaney|P|Princeton": 4,
        "Andrew|Chin|P|Princeton": 3,
        "Tom|Randolph|P|Princeton": 3,
        "Carter|Hamilton|P|Yale": 4,
        "Jack|Winthrop|P|Yale": 4,
        "Tim|Buckley|P|Yale": 3,
        "Colin|Wyatt|P|Brown": 3,
        "Aiden|Pierce|P|Brown": 2,
        "Luke|Jones|P|Coastal Carolina": 4,
        "Ryan|Lynch|P|Coastal Carolina": 3,
        "Dominick|Carbone|P|Coastal Carolina": 4,
        "Keenan|Tillery|P|Coastal Carolina": 4,
        "Thomas|Crabtree|P|Southern Miss": 4,
        "Camden|Sunstrom|P|Southern Miss": 4,
        "KL|Farr|P|Southern Miss": 3,
        "Levi|Perkins|P|Troy": 4,
        "Jaxon|Smith|P|Troy": 3,
        "Marcus|Dean|P|Troy": 3,
        "Chase|Hunley|P|Marshall": 4,
        "Aiden|Curry|P|Marshall": 3,
        "Ethan|Cross|P|Marshall": 2,
        "Collin|Hebert|P|Louisiana": 4,
        "Drew|Simon|P|Louisiana": 4,
        "Bryce|Comeaux|P|Louisiana": 3,
        "Cole|Fowler|P|Old Dominion": 3,
        "Ryan|Webb|P|Old Dominion": 3,
        "Landon|Peck|P|Old Dominion": 3,
        "Hunter|Ponder|P|Arkansas State": 3,
        "Nolan|Schubart|P|Arkansas State": 3,
        "Brady|Ward|P|Arkansas State": 3,
        "Jake|Pennington|P|Arkansas State": 3,
        "Elijah|Ford|P|Arkansas State": 2,
        "Ty|Fisher|P|Georgia Southern": 4,
        "David|Johnson|P|Georgia Southern": 4,
        "Ryan|Gilmore|P|Georgia Southern": 4,
        "Cooper|Edge|P|Georgia Southern": 3,
        "Ben|Norris|P|Georgia Southern": 3,
        "Ryne|Stanley|P|App State": 4,
        "Jake|Blevins|P|App State": 4,
        "Hunter|Morefield|P|App State": 4,
        "Austin|Holbrook|P|App State": 4,
        "Jackson|Pratt|P|Georgia State": 2,
        "Miles|Langlois|P|South Alabama": 4,
        "Blake|Pfister|P|South Alabama": 4,
        "Bryce|Donovan|P|South Alabama": 3,
        "Tyler|Blohm|P|James Madison": 4,
        "Nick|Walters|P|James Madison": 4,
        "Landon|May|P|James Madison": 3,
        "Tanner|Bibee|P|Cal State Fullerton": 4,
        "Jared|Meza|P|Cal State Fullerton": 4,
        "Ethan|Park|P|Cal State Fullerton": 2,
        "Brandon|Vu|P|Cal State Fullerton": 4,
        "Travis|Stump|P|Long Beach State": 4,
        "Tommy|Reyes|P|Long Beach State": 4,
        "Nick|Luna|P|Long Beach State": 4,
        "Ryan|Tanaka|P|UC Irvine": 4,
        "Justin|Nguyen|P|UC Irvine": 4,
        "Derek|Sato|P|UC Irvine": 4,
        "Tyler|Marsh|P|UC Irvine": 3,
        "Shane|Bishop|P|UC Santa Barbara": 4,
        "Tyler|Manning|P|UC Santa Barbara": 4,
        "Ethan|Reed|P|UC Santa Barbara": 4,
        "Kai|Nelson|P|UC San Diego": 4,
        "Sam|Torres|P|UC San Diego": 4,
        "Ryan|Cho|P|UC San Diego": 4,
        "Jason|Park|P|UC San Diego": 3,
        "Luke|Simmons|P|UC San Diego": 2,
        "Kekoa|Kalani|P|Hawaii": 4,
        "Brandon|Lau|P|Hawaii": 4,
        "Jake|Perreira|P|Hawaii": 3,
        "Dustin|Medeiros|P|Hawaii": 4,
        "Nick|Yamada|P|Hawaii": 4,
        "Logan|Davis|P|Cal Poly": 4,
        "Connor|Marsh|P|Cal Poly": 4,
        "Brady|Ferguson|P|Cal Poly": 4,
        "Derek|Pugh|P|Cal Poly": 4,
        "Jordan|Reese|P|Cal Poly": 3,
        "Gavin|Ortiz|P|Cal Poly": 2,
        "Matt|Whitfield|P|UC Davis": 4,
        "Danny|Vega|P|Cal State Northridge": 3,
        "Alex|Duarte|P|Cal State Northridge": 3,
        "Kevin|Park|P|Cal State Northridge": 2,
        "Ryan|Orozco|P|Cal State Bakersfield": 4,
        "Chris|Valdez|P|Cal State Bakersfield": 3,
        "Isaac|Ayala|P|Cal State Bakersfield": 2,
        "Terrence|Brooks|P|Grambling State": 3,
        "Kendrick|Mouton|P|Grambling State": 3,
        "Andre|Landry|P|Grambling State": 3,
        "Marlon|Baptiste|P|Southern University": 3,
        "Donovan|Arceneaux|P|Southern University": 4,
        "Antoine|Breaux|P|Southern University": 3,
        "Marcus|Odom|P|Florida A&M": 4,
        "Devin|Holloway|P|Florida A&M": 3,
        "Raheem|Knox|P|Florida A&M": 4,
        "Tyree|Garrison|P|Bethune-Cookman": 3,
        "DeMarco|Hines|P|Bethune-Cookman": 3,
        "Jaheim|Grady|P|Bethune-Cookman": 3,
        "Jaquez|Tillman|P|Jackson State": 3,
        "Kayden|Stamps|P|Jackson State": 3,
        "Quentin|Pratt|P|Jackson State": 3,
        "Javoris|Clay|P|Jackson State": 3,
        "Terrell|Graves|P|North Carolina A&T": 4,
        "Khalid|Person|P|North Carolina A&T": 3,
        "Rashaun|Keith|P|North Carolina A&T": 4,
        "Tylon|Rivers|P|North Carolina A&T": 3,
        "Devante|Staton|P|North Carolina A&T": 3,
        "DeShawn|Perry|P|Alabama State": 4,
        "Rodney|Austin|P|Alabama State": 4,
        "Marcus|Odom|P|Alabama State": 4,
        "Jameson|Fuller|P|Alabama State": 3,
        "Antione|Steele|P|Alabama State": 4,
        "Darian|Epps|P|Norfolk State": 4,
        "Deshon|Sparks|P|Alcorn State": 3,
        "Reginald|Crook|P|Alcorn State": 3,
        "Damion|Riggs|P|Alcorn State": 3,
        "Cortland|Price|P|Prairie View A&M": 3,
        "Derrius|Lane|P|Prairie View A&M": 3,
        "Latrell|Mixon|P|Prairie View A&M": 3,
        "Kendall|Booker|P|Texas Southern": 3,
        "Javoris|Pryor|P|Texas Southern": 3,
        "Ladarion|Spears|P|Texas Southern": 4,
        "Solomon|Grant|P|Howard": 4,
        "Landon|Wyatt|P|Howard": 3,
        "Caleb|Saunders|P|Howard": 3,
        "Marquis|Odom|P|Delaware State": 3,
        "Tavon|Bass|P|Delaware State": 3,
        "DeShawn|Hooks|P|Delaware State": 3,
        "Rasheed|Mason|P|Coppin State": 3,
        "Deshawn|Mosley|P|Coppin State": 3,
        "Lamont|Gill|P|Coppin State": 3,
        "Jermaine|Pollard|P|North Carolina Central": 4,
        "Darian|Foxx|P|North Carolina Central": 3,
        "Jaylen|Oglesby|P|North Carolina Central": 3,
        "Kevon|Price|P|Maryland Eastern Shore": 3,
        "Jaylin|Hooks|P|Maryland Eastern Shore": 3,
        "Khalil|Craig|P|Maryland Eastern Shore": 3,
        "Jamir|Stone|P|Maryland Eastern Shore": 3,
        "Rasheed|Kirk|P|Maryland Eastern Shore": 3,
        "Davion|Ash|P|Maryland Eastern Shore": 3,
        "Jake|Cline|P|Missouri State": 4,
        "Tyler|Drummond|P|Missouri State": 4,
        "Brandon|Wertz|P|Missouri State": 4,
        "Tanner|Briggs|P|Missouri State": 4,
        "Brett|Lohse|P|Missouri State": 4,
        "Ryan|Fetter|P|Missouri State": 3,
        "Drew|Patterson|P|Indiana State": 4,
        "Ryan|Quigley|P|Illinois State": 4,
        "Jake|Ellison|P|Illinois State": 4,
        "Nate|Reeves|P|Illinois State": 3,
        "Lane|Otten|P|Southern Illinois": 4,
        "Trent|Shelton|P|Southern Illinois": 4,
        "Drew|Fulks|P|Southern Illinois": 4,
        "Mitch|Darby|P|Bradley": 4,
        "Sam|Tuttle|P|Bradley": 4,
        "Tanner|Vogt|P|Bradley": 4,
        "Ben|Rapp|P|Bradley": 2,
        "Luke|Bauer|P|Evansville": 4,
        "Trent|Bower|P|Evansville": 4,
        "Jason|Kline|P|Evansville": 3,
        "Ryan|Slager|P|Valparaiso": 4,
        "Blake|Dunn|P|Valparaiso": 4,
        "Nate|Hoover|P|Valparaiso": 4,
        "Matt|Dolan|P|Valparaiso": 2,
        "Marcus|DiLeo|P|UIC": 4,
        "Tony|Palumbo|P|UIC": 4,
        "Jacob|Perez|P|UIC": 3,
        "Braden|Holcomb|P|Belmont": 4,
        "Cade|Pennell|P|Belmont": 4,
        "Liam|Knox|P|Belmont": 4,
        "Austin|Blount|P|Belmont": 3,
        "James|Wyatt|P|Belmont": 3,
        "Kyle|Wickliffe|P|Murray State": 4,
        "Cole|Brashear|P|Murray State": 4,
        "Wyatt|Greer|P|Murray State": 3,
        "Mason|Hart|P|Murray State": 4,
        "Trey|Moss|P|Murray State": 4,
        "Jake|Norris|P|Western Illinois": 4,
        "Sam|Thorn|P|Western Illinois": 4,
        "Cole|Bridges|P|Western Illinois": 3,
        "Tyler|Goff|P|Western Illinois": 3,
        "Ryan|Stout|P|Western Illinois": 3,
        "Matt|Engle|P|Western Illinois": 2,
        "Chase|Plumb|P|Western Illinois": 2,
        "Zach|Zirbel|P|Northern Iowa": 3,
        "Brady|Hoffman|P|Creighton": 4,
        "Cole|Meier|P|Creighton": 4,
        "Boede|Rahe|P|Kansas": 4,
        "Manning|West|P|Kansas": 4,
        "Carter|Fink|P|Kansas": 4,
        "David|Perez|P|West Virginia": 4,
        "Reese|Bassinger|P|West Virginia": 4,
        "Griffin|Kirn|P|West Virginia": 4,
        "Ben|Jacobs|P|Arizona State": 4,
        "Brock|Peery|P|Arizona State": 4,
        "Kade|Boyd|P|Arizona State": 4,
        "Casey|Hintz|P|Arizona": 4,
        "Owen|Kramkowski|P|Arizona": 4,
        "Bryce|Lavelle|P|Arizona": 4,
        "Cooper|Stinson|P|Baylor": 4,
        "Mason|Marriott|P|Baylor": 4,
        "Carter|Dorighi|P|Baylor": 4,
        "Brody|Drost|P|Baylor": 4,
        "Cole|Gambill|P|BYU": 4,
        "Talmage|Bushman|P|BYU": 4,
        "Jaden|Robinson|P|BYU": 4,
        "Kaden|Lampi|P|BYU": 4,
        "Caleb|Wood|P|Cincinnati": 4,
        "Jacob|McNeely|P|Cincinnati": 4,
        "Tyler|Spaulding|P|Cincinnati": 4,
        "Drew|Stahl|P|Cincinnati": 4,
        "Cole|Schweitzer|P|Cincinnati": 4,
        "Andrew|Bishop|P|Houston": 4,
        "Anthony|Tulimero|P|Houston": 4,
        "Carter|Powell|P|Houston": 4,
        "Drew|Markle|P|Houston": 4,
        "Caleb|Bovio|P|Houston": 4,
        "Brycen|Mautz|P|Houston": 4,
        "Owen|Boerema|P|Kansas State": 4,
        "Caden|Favors|P|Kansas State": 4,
        "Brandon|Bishop|P|Oklahoma State": 4,
        "Ben|Hampton|P|Oklahoma State": 4,
        "Tommy|LaPour|P|TCU": 4,
        "Louis|Rodriguez|P|TCU": 4,
        "Nolan|Smith|P|TCU": 4,
        "Caedmon|Parker|P|TCU": 4,
        "Carson|Hansen|P|Texas Tech": 4,
        "Kyle|Robinson|P|Texas Tech": 4,
        "Jacob|Rogers|P|Texas Tech": 4,
        "Drew|Schultz|P|UCF": 4,
        "Jacob|Curi|P|UCF": 4,
        "Tyler|Davis|P|UCF": 4,
        "Carson|Maddox|P|UCF": 4,
        "Bryson|Van Sickle|P|Utah": 4,
        "Drew|Vermilye|P|Utah": 4,
        "Jaxon|Walker|P|Utah": 4,
        "Carter|Spivey|P|East Carolina": 4,
        "Marcus|Seyller|P|East Carolina": 4,
        "Nathan|Doran|P|East Carolina": 4,
        "Justin|Coleman|P|East Carolina": 4,
        "Chase|Bilek|P|Wichita State": 4,
        "Mason|Kokalis|P|Wichita State": 4,
        "Ryne|Poole|P|Wichita State": 4,
        "Will|Dreiling|P|Wichita State": 4,
        "Tyson|Hardin|P|Tulane": 4,
        "Jackson|Lofton|P|Tulane": 4,
        "Tanner|Creevy|P|Tulane": 4,
        "Cole|Fontaine|P|Tulane": 3,
        "Pierre|Thibodaux|P|Tulane": 4,
        "Brandon|McPherson|P|Memphis": 4,
        "Jonah|Cox|P|Memphis": 4,
        "Braxton|Vines|P|Memphis": 4,
        "Caleb|Hensley|P|Memphis": 3,
        "Luke|Randolph|P|Memphis": 4,
        "Daniel|Cantu|P|South Florida": 4,
        "Connor|Hincks|P|South Florida": 4,
        "Chris|Clements|P|South Florida": 4,
        "Caleb|Noftsger|P|Charlotte": 4,
        "Jake|Goodman|P|Charlotte": 4,
        "Lucas|Steele|P|UAB": 4,
        "Cam|Clements|P|UAB": 3,
        "Dylan|Windham|P|UAB": 4,
        "Parker|Smith|P|Rice": 4,
        "Riley|Cooper|P|Rice": 4,
        "Drew|Dowd|P|Rice": 4,
        "Chase|Centala|P|Rice": 4,
        "Alex|Royalty|P|Florida Atlantic": 4,
        "Jake|Stevenson|P|Florida Atlantic": 3,
        "Matt|Calhoun|P|Florida Atlantic": 4,
        "Cooper|Reed|P|North Texas": 4,
        "Logan|Sanders|P|North Texas": 4,
        "Carlos|Johnson|P|North Texas": 4,
        "Brock|Whittlesey|P|Dallas Baptist": 4,
        "Wyatt|Gonzales|P|Dallas Baptist": 4,
        "Mason|Ornelas|P|Dallas Baptist": 3,
        "Patrick|Christensen|P|Pepperdine": 4,
        "Lucien|Wechsberg|P|Pepperdine": 4,
        "AJ|Bianchina|P|Pepperdine": 4,
        "Esteban|Sepulveda|P|Pepperdine": 4,
        "Joe|Cardinale|P|Pepperdine": 4,
        "Jaden|Sheffield|P|Loyola Marymount": 4,
        "Alex|Chavez|P|Loyola Marymount": 4,
        "Colin|Caycedo|P|Loyola Marymount": 4,
        "Robbie|Ayers|P|Loyola Marymount": 4,
        "Gavin|Jacobsen|P|Loyola Marymount": 4,
        "Kevin|Sim|P|San Diego": 4,
        "Nick|Suspenzi|P|San Diego": 4,
        "Patrick|Reilly|P|San Diego": 4,
        "Bret|Barber|P|San Diego": 4,
        "Connor|Dougherty|P|San Diego": 4,
        "Cole|Tremain|P|Saint Mary's": 4,
        "Cole|Percival|P|Saint Mary's": 4,
        "Ryan|Gonzalez|P|Saint Mary's": 4,
        "Payton|Knowles|P|Gonzaga": 4,
        "Landon|Hood|P|Gonzaga": 4,
        "Max|Bayles|P|Santa Clara": 4,
        "James|Bose|P|Santa Clara": 4,
        "Troy|Claussen|P|Santa Clara": 4,
        "Jacob|Sharp|P|Portland": 4,
        "Morgan|Codron|P|Portland": 4,
        "Quin|Dufort|P|Portland": 4,
        "Cole|Katayama-Stall|P|Portland": 4,
        "Aidan|Risse|P|San Francisco": 4,
        "Logan|Schweizer|P|San Francisco": 4,
        "TJ|Rogers|P|San Francisco": 4,
      };

      // Build entries array from the static map.
      type PitchEntry = { fn: string; ln: string; pos: string; tn: string; vsl: number };
      const entries: PitchEntry[] = [];
      for (const [compositeKey, vslVal] of Object.entries(PITCH_VSL_MAP)) {
        const parts = compositeKey.split("|");
        if (parts.length !== 4) continue;
        const [fn, ln, pos, tn] = parts;
        entries.push({ fn, ln, pos, tn, vsl: vslVal });
      }

      // Process in batches of 50 to stay well under the DB statement timeout.
      // Each batch runs an unnest-based bulk UPDATE so we get ~11 round-trips
      // total instead of 545 individual queries.
      const BATCH_SIZE = 50;
      let updated = 0;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const fns  = batch.map(e => e.fn);
        const lns  = batch.map(e => e.ln);
        const poss = batch.map(e => e.pos);
        const tns  = batch.map(e => e.tn);
        const vsls = batch.map(e => e.vsl);
        const { rowCount } = await pool.query(`
          UPDATE players p
          SET pitch_vsl = src.vsl
          FROM (
            SELECT
              unnest($1::text[]) AS first_name,
              unnest($2::text[]) AS last_name,
              unnest($3::text[]) AS position,
              unnest($4::text[]) AS team_name,
              unnest($5::int[])  AS vsl
          ) AS src
          JOIN teams t ON t.name = src.team_name
          WHERE p.first_name = src.first_name
            AND p.last_name  = src.last_name
            AND p.position   = src.position
            AND p.team_id    = t.id
            AND (p.pitch_vsl IS DISTINCT FROM src.vsl)
        `, [fns, lns, poss, tns, vsls]);
        updated += rowCount ?? 0;
      }

      await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('real-roster-pitch-sync-v6')
        ON CONFLICT (key) DO NOTHING
      `);

      console.log(`[startup-migration] real-roster-pitch-sync-v6: synced pitch_vsl for ${updated ?? 0} pitcher(s) across all conferences`);

      // Spot-checks for the two originally reported cases + a cross-conference sample.
      try {
        const { rows: spots } = await pool.query<{ first_name: string; last_name: string; team_name: string; pitch_vsl: number }>(`
          SELECT p.first_name, p.last_name, t.name AS team_name, p.pitch_vsl
          FROM players p JOIN teams t ON t.id = p.team_id
          WHERE (p.first_name = 'Aidan'  AND p.last_name = 'King'    AND t.name = 'Florida')
             OR (p.first_name = 'Caden'  AND p.last_name = 'Glauber' AND t.name = 'North Carolina')
             OR (p.first_name = 'Jake'   AND p.last_name = 'Cline'   AND t.name = 'Missouri State')
             OR (p.first_name = 'Marcus' AND p.last_name = 'DiLeo'   AND t.name = 'UIC')
        `);
        for (const s of spots) {
          console.log(`[startup-migration] spot-check ${s.first_name} ${s.last_name} (${s.team_name}): pitch_vsl=${s.pitch_vsl}`);
        }
      } catch (_) { /* non-fatal */ }
    } catch (e) {
      console.warn("[startup-migration] real-roster-pitch-sync-v6 failed:", e);
    }
  })();

  // Proxy /__mockup/ to the mockup sandbox dev server (port 23636)
  app.use('/__mockup', (req, res) => {
    const proxyPath = `/__mockup${req.originalUrl.slice('/__mockup'.length)}`;
    const proxyReq = httpRequest(
      { hostname: 'localhost', port: 23636, path: proxyPath, method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) res.status(502).send('Mockup sandbox not available');
    });
    req.pipe(proxyReq, { end: true });
  });

  await registerRoutes(httpServer, app);

  // One-time OVR resync — runs in background after startup.
  // Recomputes calculateOVR() for every player and corrects any stored `overall`
  // that drifted out of sync when the OVR formula weights were last updated.
  // Also clears suspiciously large negative progressionDeltas.overall (< -20)
  // that were caused by formula-drift, not genuine regression.
  void (async () => {
    try {
      const { rows: players } = await pool.query<{
        id: string;
        position: string | null;
        hit_for_avg: number | null; power: number | null; speed: number | null;
        arm: number | null; fielding: number | null; error_resistance: number | null;
        velocity: number | null; control: number | null; stamina: number | null; stuff: number | null;
        clutch: number | null; vs_lhp: number | null; grit: number | null; stealing: number | null;
        running: number | null; throwing: number | null; recovery: number | null;
        w_risp: number | null; vs_lefty: number | null; poise: number | null;
        heater: number | null; agile: number | null;
        abilities: string[] | null;
        overall: number | null;
        star_rating: number | null;
        progression_deltas: Record<string, number> | null;
      }>(`
        SELECT id, position,
          hit_for_avg, power, speed, arm, fielding, error_resistance,
          velocity, control, stamina, stuff,
          clutch, vs_lhp, grit, stealing, running, throwing, recovery,
          w_risp, vs_lefty, poise, heater, agile,
          abilities, overall, star_rating, progression_deltas
        FROM players
      `);

      let resynced = 0;
      let deltaCleared = 0;

      for (const p of players) {
        const computed = calculateOVR({
          position: p.position,
          hitForAvg: p.hit_for_avg, power: p.power, speed: p.speed,
          arm: p.arm, fielding: p.fielding, errorResistance: p.error_resistance,
          velocity: p.velocity, control: p.control, stamina: p.stamina, stuff: p.stuff,
          clutch: p.clutch, vsLHP: p.vs_lhp, grit: p.grit, stealing: p.stealing,
          running: p.running, throwing: p.throwing, recovery: p.recovery,
          wRISP: p.w_risp, vsLefty: p.vs_lefty, poise: p.poise, heater: p.heater, agile: p.agile,
          abilities: p.abilities,
        });
        const newStar = getStarRatingFromOVR(computed);

        const setFields: string[] = [];
        const vals: (string | number | null)[] = [];

        if (p.overall !== computed) {
          setFields.push(`overall = $${vals.length + 1}`); vals.push(computed);
          setFields.push(`star_rating = $${vals.length + 1}`); vals.push(newStar);
          resynced++;
        }

        // Clear suspiciously large negative delta caused by formula drift (< -20)
        const ovrDelta = p.progression_deltas?.overall;
        if (typeof ovrDelta === "number" && ovrDelta < -20) {
          const cleared: Record<string, number> = { ...p.progression_deltas };
          delete cleared.overall;
          const newDeltas = Object.keys(cleared).length > 0 ? JSON.stringify(cleared) : null;
          setFields.push(`progression_deltas = $${vals.length + 1}`); vals.push(newDeltas);
          deltaCleared++;
        }

        if (setFields.length > 0) {
          vals.push(p.id);
          await pool.query(
            `UPDATE players SET ${setFields.join(", ")} WHERE id = $${vals.length}`,
            vals,
          );
        }
      }

      if (resynced > 0 || deltaCleared > 0) {
        console.log(`[ovr-resync] Corrected ${resynced} player OVR values, cleared ${deltaCleared} spurious negative deltas`);
      }
    } catch (e) {
      console.warn("[ovr-resync] Failed:", e);
    }
  })();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
