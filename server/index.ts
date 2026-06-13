import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer, request as httpRequest } from "http";
import { pool } from "./db";
import { calculateOVR, getStarRatingFromOVR } from "../shared/abilities";
import { ALL_REAL_ROSTERS } from "./realRosters";

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

  // One-time migration: drop binary CHECK constraints on pitch_ch so it can now
  // hold values 1-7 (rated scale) instead of only 0 or 1.
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
        VALUES ('drop-pitch-ch-binary-v1')
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `);
      if (rows.length === 0) return; // already ran

      await pool.query("ALTER TABLE players  DROP CONSTRAINT IF EXISTS players_pitch_ch_binary");
      await pool.query("ALTER TABLE recruits DROP CONSTRAINT IF EXISTS recruits_pitch_ch_binary");
      console.log("[startup-migration] drop-pitch-ch-binary-v1: pitch_ch binary constraints dropped");
    } catch (e) {
      console.warn("[startup-migration] drop-pitch-ch-binary-v1 failed:", e);
    }
  })();

  // One-time pitch_spl → pitch_vsl migration.
  // When Task #1133 renamed Splitter → Vertical Slider, the pitchMix() helper in
  // roster files still mapped index-6 to pitch_spl. All 454 pitchers across SEC/ACC/
  // Big Ten/Big 12/etc. had their Splitter value stored as pitch_spl with no pitch_vsl.
  // This migrates existing dynasty players in-place.
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
        VALUES ('pitch-spl-to-vsl-v1')
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `);
      if (rows.length === 0) return; // already ran

      const result = await pool.query(`
        UPDATE players
        SET pitch_vsl = pitch_spl, pitch_spl = 0
        WHERE pitch_spl > 0 AND pitch_vsl = 0
      `);
      console.log(`[startup-migration] pitch-spl-to-vsl-v1: migrated ${result.rowCount} player(s)`);
    } catch (e) {
      console.warn("[startup-migration] pitch-spl-to-vsl-v1 failed:", e);
    }
  })();

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

  // One-time real-roster pitch sync.
  // Fixes existing-dynasty pitchers whose pitch_vsl (and other post-spread-override
  // pitch fields like pitch_cch, pitch_hsl, pitch_swp, pitch_scb, pitch_pcb) were
  // stored as 0 because the override wasn't present in the roster file when the
  // dynasty was originally created.  Canonical values come from ALL_REAL_ROSTERS
  // which already has the fully-correct pitch data (pitch fields are not scaled).
  //
  // v2: key is "firstName|lastName|position|teamName" — team-name disambiguation
  // is required because 17 pitcher name+position pairs appear on multiple real teams
  // with different pitch profiles.  v1 (keyed without team) is superseded by this
  // migration; both keys are inserted so neither re-runs on environments that
  // already have v1.
  void (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _startup_migrations (
          key text PRIMARY KEY,
          ran_at timestamp DEFAULT now()
        )
      `);

      // Mark v1 done too so it never runs on a fresh env (v2 is strictly better).
      await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('real-roster-pitch-sync-v1')
        ON CONFLICT (key) DO NOTHING
      `);

      // Guard check — do NOT insert v2 marker yet (inserted only after successful
      // sync to preserve retry-on-failure semantics).
      const { rows: check } = await pool.query<{ key: string }>(`
        SELECT key FROM _startup_migrations WHERE key = 'real-roster-pitch-sync-v2'
      `);
      if (check.length > 0) return; // already ran successfully

      const DB_COL: Record<string, string> = {
        pitchFB:  "pitch_fb",  pitch2S:  "pitch_2s",  pitchSL:  "pitch_sl",
        pitchCB:  "pitch_cb",  pitchCH:  "pitch_ch",  pitchCT:  "pitch_ct",
        pitchSNK: "pitch_snk", pitchSPL: "pitch_spl", pitchVSL: "pitch_vsl",
        pitchFK:  "pitch_fk",  pitchSFF: "pitch_sff", pitchSHU: "pitch_shu",
        pitchCCH: "pitch_cch", pitchHSL: "pitch_hsl", pitchSWP: "pitch_swp",
        pitchKN:  "pitch_kn",  pitchSCB: "pitch_scb", pitchPCB: "pitch_pcb",
      };

      // Build ground-truth pitch map keyed by "firstName|lastName|position|teamName".
      // Team name disambiguates duplicate name+position pairs that appear on multiple
      // real-roster teams with different pitch profiles.
      // Pitch fields are not part of SCALE_ATTRS so they pass through calibration
      // unchanged — post-spread overrides (e.g. pitchVSL: 4) are preserved.
      const pitchMap = new Map<string, Record<string, number>>();
      for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
        for (const p of players) {
          const key = `${p.firstName}|${p.lastName}|${p.position}|${teamName}`;
          const vals: Record<string, number> = {};
          for (const field of Object.keys(DB_COL)) {
            vals[field] = ((p as Record<string, unknown>)[field] as number) ?? 0;
          }
          // Only store pitchers with at least one non-zero pitch field
          if (Object.values(vals).some(v => v > 0)) {
            pitchMap.set(key, vals);
          }
        }
      }

      // Fetch pitchers from DB, joining teams to get the canonical team name.
      // team.name matches the keys used in ALL_REAL_ROSTERS (e.g. "Florida").
      const { rows: dbPlayers } = await pool.query<Record<string, unknown>>(`
        SELECT p.id, p.first_name, p.last_name, p.position,
          t.name AS team_name,
          p.pitch_fb, p.pitch_2s, p.pitch_sl, p.pitch_cb, p.pitch_ch, p.pitch_ct,
          p.pitch_snk, p.pitch_spl, p.pitch_vsl, p.pitch_fk, p.pitch_sff, p.pitch_shu,
          p.pitch_cch, p.pitch_hsl, p.pitch_swp, p.pitch_kn, p.pitch_scb, p.pitch_pcb
        FROM players p
        JOIN teams t ON t.id = p.team_id
        WHERE p.position IN ('P', 'SP', 'RP', 'CP')
      `);

      let updated = 0;
      for (const p of dbPlayers) {
        const key = `${p.first_name}|${p.last_name}|${p.position}|${p.team_name}`;
        const canonical = pitchMap.get(key);
        if (!canonical) continue;

        const sets: string[] = [];
        const vals: (number | string)[] = [];

        for (const [camelField, dbCol] of Object.entries(DB_COL)) {
          const dbVal = (p[dbCol] as number) ?? 0;
          const canonVal = canonical[camelField] ?? 0;
          if (dbVal !== canonVal) {
            sets.push(`${dbCol} = $${vals.length + 1}`);
            vals.push(canonVal);
          }
        }

        if (sets.length > 0) {
          vals.push(p.id as string);
          await pool.query(
            `UPDATE players SET ${sets.join(", ")} WHERE id = $${vals.length}`,
            vals,
          );
          updated++;
        }
      }

      // Insert completion marker AFTER successful sync (atomicity — if sync fails
      // mid-run, the marker is absent and the migration retries on next startup).
      await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('real-roster-pitch-sync-v2')
        ON CONFLICT (key) DO NOTHING
      `);

      console.log(`[startup-migration] real-roster-pitch-sync-v2: synced pitch values for ${updated} player(s)`);

      // Spot-check: log Aidan King (Florida) pitch_vsl so we can confirm the fix
      // in production logs without running a manual query.
      try {
        const { rows: spot } = await pool.query<{ first_name: string; last_name: string; team_name: string; pitch_vsl: number }>(`
          SELECT p.first_name, p.last_name, t.name AS team_name, p.pitch_vsl
          FROM players p
          JOIN teams t ON t.id = p.team_id
          WHERE p.first_name = 'Aidan' AND p.last_name = 'King' AND t.name = 'Florida'
          LIMIT 1
        `);
        if (spot.length > 0) {
          console.log(`[startup-migration] spot-check Aidan King (Florida): pitch_vsl=${spot[0].pitch_vsl} (expected 4)`);
        }
      } catch (_) { /* non-fatal */ }
    } catch (e) {
      console.warn("[startup-migration] real-roster-pitch-sync-v2 failed:", e);
    }
  })();

  // v3: same sync logic as v2 — re-runs for environments where v2 already ran
  // before pitchVSL: 4 was present in secBatch1.ts (e.g. Aidan King, Florida).
  void (async () => {
    try {
      // Skip CREATE TABLE — _startup_migrations is guaranteed to exist by the
      // time this v3 block runs (created by earlier migrations on first boot).
      // Skipping the concurrent CREATE TABLE IF NOT EXISTS call avoids the
      // pg_type duplicate-key race condition (error 23505) that plagued v2.

      const { rows: check } = await pool.query<{ key: string }>(`
        SELECT key FROM _startup_migrations WHERE key = 'real-roster-pitch-sync-v3'
      `);
      if (check.length > 0) return; // already ran successfully

      const DB_COL: Record<string, string> = {
        pitchFB:  "pitch_fb",  pitch2S:  "pitch_2s",  pitchSL:  "pitch_sl",
        pitchCB:  "pitch_cb",  pitchCH:  "pitch_ch",  pitchCT:  "pitch_ct",
        pitchSNK: "pitch_snk", pitchSPL: "pitch_spl", pitchVSL: "pitch_vsl",
        pitchFK:  "pitch_fk",  pitchSFF: "pitch_sff", pitchSHU: "pitch_shu",
        pitchCCH: "pitch_cch", pitchHSL: "pitch_hsl", pitchSWP: "pitch_swp",
        pitchKN:  "pitch_kn",  pitchSCB: "pitch_scb", pitchPCB: "pitch_pcb",
      };

      const pitchMap = new Map<string, Record<string, number>>();
      for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
        for (const p of players) {
          const key = `${p.firstName}|${p.lastName}|${p.position}|${teamName}`;
          const vals: Record<string, number> = {};
          for (const field of Object.keys(DB_COL)) {
            vals[field] = ((p as Record<string, unknown>)[field] as number) ?? 0;
          }
          if (Object.values(vals).some(v => v > 0)) {
            pitchMap.set(key, vals);
          }
        }
      }

      const { rows: dbPlayers } = await pool.query<Record<string, unknown>>(`
        SELECT p.id, p.first_name, p.last_name, p.position,
          t.name AS team_name,
          p.pitch_fb, p.pitch_2s, p.pitch_sl, p.pitch_cb, p.pitch_ch, p.pitch_ct,
          p.pitch_snk, p.pitch_spl, p.pitch_vsl, p.pitch_fk, p.pitch_sff, p.pitch_shu,
          p.pitch_cch, p.pitch_hsl, p.pitch_swp, p.pitch_kn, p.pitch_scb, p.pitch_pcb
        FROM players p
        JOIN teams t ON t.id = p.team_id
        WHERE p.position IN ('P', 'SP', 'RP', 'CP')
      `);

      let updated = 0;
      for (const p of dbPlayers) {
        const key = `${p.first_name}|${p.last_name}|${p.position}|${p.team_name}`;
        const canonical = pitchMap.get(key);
        if (!canonical) continue;

        const sets: string[] = [];
        const vals: (number | string)[] = [];

        for (const [camelField, dbCol] of Object.entries(DB_COL)) {
          const dbVal = (p[dbCol] as number) ?? 0;
          const canonVal = canonical[camelField] ?? 0;
          if (dbVal !== canonVal) {
            sets.push(`${dbCol} = $${vals.length + 1}`);
            vals.push(canonVal);
          }
        }

        if (sets.length > 0) {
          vals.push(p.id as string);
          await pool.query(
            `UPDATE players SET ${sets.join(", ")} WHERE id = $${vals.length}`,
            vals,
          );
          updated++;
        }
      }

      await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('real-roster-pitch-sync-v3')
        ON CONFLICT (key) DO NOTHING
      `);

      console.log(`[startup-migration] real-roster-pitch-sync-v3: synced pitch values for ${updated} player(s)`);

      try {
        const { rows: spot } = await pool.query<{ first_name: string; last_name: string; team_name: string; pitch_vsl: number }>(`
          SELECT p.first_name, p.last_name, t.name AS team_name, p.pitch_vsl
          FROM players p
          JOIN teams t ON t.id = p.team_id
          WHERE p.first_name = 'Aidan' AND p.last_name = 'King' AND t.name = 'Florida'
          LIMIT 1
        `);
        if (spot.length > 0) {
          console.log(`[startup-migration] spot-check Aidan King (Florida): pitch_vsl=${spot[0].pitch_vsl} (expected 4)`);
        }
      } catch (_) { /* non-fatal */ }
    } catch (e) {
      console.warn("[startup-migration] real-roster-pitch-sync-v3 failed:", e);
    }
  })();

  // v4: targeted direct fix for known players whose pitch values were wrong before v3.
  // Uses player name directly — no team-name key matching required.
  void (async () => {
    try {
      const { rows: check } = await pool.query<{ key: string }>(`
        SELECT key FROM _startup_migrations WHERE key = 'real-roster-pitch-sync-v4'
      `);
      if (check.length > 0) return;

      // Aidan King (Florida) — pitchVSL should be 4, pitchSNK should be 4
      const { rowCount: aidanFix } = await pool.query(`
        UPDATE players SET pitch_vsl = 4
        WHERE first_name = 'Aidan' AND last_name = 'King'
          AND position = 'P' AND pitch_vsl != 4
      `);

      await pool.query(`
        INSERT INTO _startup_migrations (key)
        VALUES ('real-roster-pitch-sync-v4')
        ON CONFLICT (key) DO NOTHING
      `);

      console.log(`[startup-migration] real-roster-pitch-sync-v4: Aidan King pitch_vsl fixed for ${aidanFix ?? 0} row(s)`);
    } catch (e) {
      console.warn("[startup-migration] real-roster-pitch-sync-v4 failed:", e);
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
