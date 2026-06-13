import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer, request as httpRequest } from "http";
import { pool } from "./db";
import { calculateOVR, getStarRatingFromOVR } from "../shared/abilities";
import { getRealRosters } from "./realRostersLoader";

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
      async function once(key: string, fn: () => Promise<void>): Promise<void> {
        const { rows } = await pool.query<{ key: string }>(
          `INSERT INTO _startup_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key`,
          [key],
        );
        if (rows.length === 0) return; // already ran
        await fn();
      }

      // onceAfter(): mark-after guard — key inserted only on success.
      // Use for operations that may fail partway through and need to retry.
      async function onceAfter(key: string, fn: () => Promise<void>): Promise<void> {
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
