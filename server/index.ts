import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
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
  ]).then(results => {
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      failed.forEach(r => console.warn("[startup-migration] column add failed:", (r as PromiseRejectedResult).reason));
    }
  });

  // pitch_ch constraints — clamp first, then add constraint (must be sequential per table)
  await Promise.allSettled([
    (async () => {
      await pool.query("UPDATE players SET pitch_ch = 1 WHERE pitch_ch > 1");
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE c.conname = 'players_pitch_ch_binary'
              AND t.relname = 'players'
              AND n.nspname = 'public'
          ) THEN
            ALTER TABLE players ADD CONSTRAINT players_pitch_ch_binary CHECK (pitch_ch IN (0, 1));
          END IF;
        END $$;
      `);
    })(),
    (async () => {
      await pool.query("UPDATE recruits SET pitch_ch = 1 WHERE pitch_ch > 1");
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE c.conname = 'recruits_pitch_ch_binary'
              AND t.relname = 'recruits'
              AND n.nspname = 'public'
          ) THEN
            ALTER TABLE recruits ADD CONSTRAINT recruits_pitch_ch_binary CHECK (pitch_ch IN (0, 1));
          END IF;
        END $$;
      `);
    })(),
  ]).then(results => {
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      failed.forEach(r => console.warn("[startup-migration] pitch_ch constraint failed:", (r as PromiseRejectedResult).reason));
    }
  });

  // One-time pitcher stamina banding migration (role-based bands: starters 80-99,
  // long relief 50-79, mid relief 30-49, closer 1-29).
  // Guarded by a _startup_migrations table so it only runs once per environment.
  void (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _startup_migrations (
          key text PRIMARY KEY,
          ran_at timestamp DEFAULT now()
        )
      `);
      const { rows } = await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('pitcher-stamina-bands-v1')
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `);
      if (rows.length === 0) return; // already ran

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
    } catch (e) {
      console.warn("[startup-migration] pitcher-stamina-bands failed:", e);
    }
  })();

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
