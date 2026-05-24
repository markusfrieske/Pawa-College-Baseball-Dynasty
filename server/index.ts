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
  // Ensure phase_deadline column exists (idempotent, safe on any environment)
  try {
    await pool.query("ALTER TABLE leagues ADD COLUMN IF NOT EXISTS phase_deadline TIMESTAMP");
  } catch (e) {
    console.warn("[startup-migration] phase_deadline column check failed:", e);
  }

  // Ensure metadata column exists on league_events (for decommit alert structured data)
  try {
    await pool.query("ALTER TABLE league_events ADD COLUMN IF NOT EXISTS metadata jsonb");
  } catch (e) {
    console.warn("[startup-migration] league_events.metadata column check failed:", e);
  }

  // Ensure top recruit columns exist on recruiting_class_snapshots (for signing day summary card)
  try {
    await pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_name text");
    await pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_ovr integer");
    await pool.query("ALTER TABLE recruiting_class_snapshots ADD COLUMN IF NOT EXISTS top_recruit_stars integer");
  } catch (e) {
    console.warn("[startup-migration] recruiting_class_snapshots top_recruit columns check failed:", e);
  }

  // Ensure tools column exists on players and recruits (tool archetype system)
  try {
    await pool.query("ALTER TABLE players ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb");
    await pool.query("ALTER TABLE recruits ADD COLUMN IF NOT EXISTS tools jsonb DEFAULT '[]'::jsonb");
  } catch (e) {
    console.warn("[startup-migration] tools column check failed:", e);
  }

  // Ensure pitch_ch is constrained to 0 or 1 on both players and recruits tables.
  // Step 1: clamp any existing out-of-range values so the constraint can be added cleanly.
  // Step 2: add the CHECK constraint idempotently (skipped if it already exists).
  try {
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
  } catch (e) {
    console.warn("[startup-migration] players pitch_ch constraint failed:", e);
  }
  try {
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
  } catch (e) {
    console.warn("[startup-migration] recruits pitch_ch constraint failed:", e);
  }

  // Ensure source_player_id column exists on player_history (for direct HoF WAR lookup)
  try {
    await pool.query("ALTER TABLE player_history ADD COLUMN IF NOT EXISTS source_player_id varchar");
  } catch (e) {
    console.warn("[startup-migration] player_history.source_player_id column check failed:", e);
  }

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
