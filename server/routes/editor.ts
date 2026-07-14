/**
 * Commissioner League Editor API
 *
 * Versioned, permissioned bulk-edit endpoints for teams and players.
 * Every successful PATCH creates an audit batch + per-field change rows.
 *
 * Endpoints:
 *   GET  /api/leagues/:id/editor/schools
 *   GET  /api/leagues/:id/editor/players
 *   PATCH /api/leagues/:id/editor/schools/:teamId
 *   PATCH /api/leagues/:id/editor/players/:playerId
 *   GET  /api/leagues/:id/editor/history
 *   POST /api/leagues/:id/editor/batches/:batchId/reverse
 */

import type { Express } from "express";
import { z } from "zod";
import { pool } from "../db";
import { storage } from "../storage";
import { requireCommissioner, hasCommissionerAccess } from "../route-helpers";
import { requireAuth } from "../route-helpers";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";
import { invalidateLeague } from "../cache";

// ── Allowlists ────────────────────────────────────────────────────────────────

const TEAM_IDENTITY_FIELDS = new Set([
  "name", "mascot", "abbreviation", "primaryColor", "secondaryColor", "city", "state",
]);

const TEAM_COMPETITIVE_FIELDS = new Set([
  "prestige", "facilities", "academics", "stadium", "collegeLife",
  "marketing", "nilBudget", "enrollment", "fanbasePassion", "fanbaseType",
]);

const TEAM_IDENTITY_SCHEMA = z.object({
  name: z.string().min(1).max(100).optional(),
  mascot: z.string().min(1).max(100).optional(),
  abbreviation: z.string().min(2).max(8).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(2).max(30).optional(),
}).strict();

const TEAM_COMPETITIVE_SCHEMA = z.object({
  prestige: z.number().int().min(1).max(10).optional(),
  facilities: z.number().int().min(1).max(10).optional(),
  academics: z.number().int().min(1).max(10).optional(),
  stadium: z.number().int().min(1).max(10).optional(),
  collegeLife: z.number().int().min(1).max(10).optional(),
  marketing: z.number().int().min(1).max(10).optional(),
  nilBudget: z.number().int().min(0).optional(),
  enrollment: z.number().int().min(0).optional(),
  fanbasePassion: z.enum(["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-"]).optional(),
  fanbaseType: z.string().max(50).optional(),
}).strict();

const TEAM_ALL_SCHEMA = z.object({
  ...TEAM_IDENTITY_SCHEMA.shape,
  ...TEAM_COMPETITIVE_SCHEMA.shape,
}).strict();

const PLAYER_IDENTITY_SCHEMA = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  homeState: z.string().max(30).optional(),
  hometown: z.string().max(80).optional(),
  position: z.string().max(10).optional(),
  eligibility: z.enum(["FR","SO","JR","SR"]).optional(),
  // Appearance
  skinTone: z.enum(["light","fair","medium","tan","dark","deep"]).optional(),
  hairColor: z.enum(["black","brown","blonde","red","gray","white","auburn"]).optional(),
  hairStyle: z.enum(["short","medium","long","buzz","bald","curly","wavy","spiky"]).optional(),
  facialHair: z.enum(["none","stubble","beard","mustache","goatee","full_beard"]).optional(),
}).strict();

const PLAYER_COMPETITIVE_SCHEMA = z.object({
  abilities: z.array(z.string()).optional(),
  potential: z.number().int().min(0).max(100).optional(),
  hitForAvg: z.number().int().min(0).max(100).optional(),
  power: z.number().int().min(0).max(100).optional(),
  speed: z.number().int().min(0).max(100).optional(),
  arm: z.number().int().min(0).max(100).optional(),
  fielding: z.number().int().min(0).max(100).optional(),
  errorResistance: z.number().int().min(0).max(100).optional(),
  clutch: z.number().int().min(0).max(100).optional(),
  vsLHP: z.number().int().min(0).max(100).optional(),
  grit: z.number().int().min(0).max(100).optional(),
  stealing: z.number().int().min(0).max(100).optional(),
  running: z.number().int().min(0).max(100).optional(),
  throwing: z.number().int().min(0).max(100).optional(),
  recovery: z.number().int().min(0).max(100).optional(),
  catcherAbility: z.number().int().min(0).max(100).optional(),
  velocity: z.number().int().min(0).max(100).optional(),
  control: z.number().int().min(0).max(100).optional(),
  stamina: z.number().int().min(0).max(100).optional(),
  stuff: z.number().int().min(0).max(100).optional(),
  wRISP: z.number().int().min(0).max(100).optional(),
  vsLefty: z.number().int().min(0).max(100).optional(),
  poise: z.number().int().min(0).max(100).optional(),
  heater: z.number().int().min(0).max(100).optional(),
  agile: z.number().int().min(0).max(100).optional(),
  pitchFB: z.number().int().min(0).max(7).optional(),
  pitch2S: z.number().int().min(0).max(7).optional(),
  pitchSL: z.number().int().min(0).max(7).optional(),
  pitchCB: z.number().int().min(0).max(7).optional(),
  pitchCH: z.number().int().min(0).max(7).optional(),
  pitchCT: z.number().int().min(0).max(7).optional(),
  pitchSNK: z.number().int().min(0).max(7).optional(),
  pitchSPL: z.number().int().min(0).max(7).optional(),
  pitchSHU: z.number().int().min(0).max(7).optional(),
  pitchCCH: z.number().int().min(0).max(7).optional(),
  pitchHSL: z.number().int().min(0).max(7).optional(),
  pitchSWP: z.number().int().min(0).max(7).optional(),
  pitchKN: z.number().int().min(0).max(7).optional(),
  pitchVSL: z.number().int().min(0).max(7).optional(),
  pitchSFF: z.number().int().min(0).max(7).optional(),
  pitchFK: z.number().int().min(0).max(7).optional(),
  pitchSCB: z.number().int().min(0).max(7).optional(),
  pitchPCB: z.number().int().min(0).max(7).optional(),
}).strict();

const PLAYER_ALL_SCHEMA = z.object({
  ...PLAYER_IDENTITY_SCHEMA.shape,
  ...PLAYER_COMPETITIVE_SCHEMA.shape,
}).strict();

const PATCH_META_SCHEMA = z.object({
  expectedVersion: z.number().int().min(1),
  changes: z.record(z.unknown()),
  reason: z.string().min(1).max(500),
  effectiveSeason: z.number().int().min(1).optional(),
  idempotencyKey: z.string().min(1).max(100),
});

// Convert camelCase to snake_case for DB column names
function toSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase();
}

// Build a SET clause and values array from a camelCase update object
function buildSetClause(updates: Record<string, unknown>): { setClause: string; values: unknown[] } {
  const entries = Object.entries(updates);
  const sets: string[] = [];
  const values: unknown[] = [];
  entries.forEach(([key, val], i) => {
    sets.push(`${toSnake(key)} = $${i + 1}`);
    values.push(Array.isArray(val) ? JSON.stringify(val) : val);
  });
  return { setClause: sets.join(", "), values };
}

export function registerEditorRoutes(app: Express): void {
  // ── GET /editor/schools ─────────────────────────────────────────────────────
  app.get("/api/leagues/:id/editor/schools", requireAuth, requireCommissioner, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const { rows } = await pool.query<{
        id: string; league_id: string; conference_id: string | null;
        name: string; mascot: string; abbreviation: string;
        city: string; state: string;
        primary_color: string; secondary_color: string;
        prestige: number; stadium: number; facilities: number;
        college_life: number; marketing: number; academics: number;
        fanbase_passion: string; fanbase_type: string;
        enrollment: number; nil_budget: number; nil_spent: number;
        is_cpu: boolean; national_rank: number;
        editor_version: number; conference_name: string | null;
      }>(`
        SELECT t.*, t.editor_version, c.name as conference_name
        FROM teams t
        LEFT JOIN conferences c ON c.id = t.conference_id
        WHERE t.league_id = $1
        ORDER BY c.name NULLS LAST, t.name
      `, [leagueId]);

      const league = await storage.getLeague(leagueId);
      res.json({
        teams: rows.map(r => ({
          id: r.id,
          leagueId: r.league_id,
          conferenceId: r.conference_id,
          conferenceName: r.conference_name,
          name: r.name,
          mascot: r.mascot,
          abbreviation: r.abbreviation,
          city: r.city,
          state: r.state,
          primaryColor: r.primary_color,
          secondaryColor: r.secondary_color,
          prestige: r.prestige,
          stadium: r.stadium,
          facilities: r.facilities,
          collegeLife: r.college_life,
          marketing: r.marketing,
          academics: r.academics,
          fanbasePassion: r.fanbase_passion,
          fanbaseType: r.fanbase_type,
          enrollment: r.enrollment,
          nilBudget: r.nil_budget,
          nilSpent: r.nil_spent,
          isCpu: r.is_cpu,
          nationalRank: r.national_rank,
          editorVersion: r.editor_version ?? 1,
        })),
        competitiveEditsEnabled: (league as any)?.commissionerCompetitiveEditsEnabled ?? true,
      });
    } catch (err) {
      console.error("[editor] GET schools error:", err);
      res.status(500).json({ message: "Failed to fetch schools" });
    }
  });

  // ── GET /editor/players ─────────────────────────────────────────────────────
  app.get("/api/leagues/:id/editor/players", requireAuth, requireCommissioner, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.query.teamId as string | undefined;
      const position = req.query.position as string | undefined;
      const eligibility = req.query.eligibility as string | undefined;
      const search = req.query.search as string | undefined;

      let sql = `
        SELECT p.*, p.editor_version, t.name as team_name, t.abbreviation as team_abbr
        FROM players p
        JOIN teams t ON t.id = p.team_id
        WHERE t.league_id = $1
      `;
      const params: unknown[] = [leagueId];
      let idx = 2;

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 50);
      const offset = (page - 1) * pageSize;

      if (teamId) { sql += ` AND p.team_id = $${idx++}`; params.push(teamId); }
      if (position) { sql += ` AND p.position = $${idx++}`; params.push(position); }
      if (eligibility) { sql += ` AND p.eligibility = $${idx++}`; params.push(eligibility); }
      if (search) {
        sql += ` AND (LOWER(p.first_name || ' ' || p.last_name) LIKE $${idx++})`;
        params.push(`%${search.toLowerCase()}%`);
      }

      // Count total for pagination
      const countSql = sql.replace(
        /SELECT p\.\*, p\.editor_version, t\.name as team_name, t\.abbreviation as team_abbr/,
        "SELECT count(*)"
      );
      const { rows: countRows } = await pool.query(countSql, params);
      const total = parseInt(countRows[0].count ?? "0");

      sql += ` ORDER BY t.name, p.overall DESC LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(pageSize, offset);

      const { rows } = await pool.query(sql, params);

      res.json({
        players: rows.map((r: any) => ({
          id: r.id,
          teamId: r.team_id,
          teamName: r.team_name,
          teamAbbr: r.team_abbr,
          firstName: r.first_name,
          lastName: r.last_name,
          position: r.position,
          eligibility: r.eligibility,
          jerseyNumber: r.jersey_number,
          homeState: r.home_state,
          hometown: r.hometown,
          overall: r.overall,
          starRating: r.star_rating,
          potential: r.potential,
          throwHand: r.throw_hand,
          batHand: r.bat_hand,
          // Hitter attrs
          hitForAvg: r.hit_for_avg,
          power: r.power,
          speed: r.speed,
          arm: r.arm,
          fielding: r.fielding,
          errorResistance: r.error_resistance,
          clutch: r.clutch,
          vsLHP: r.vs_lhp,
          grit: r.grit,
          stealing: r.stealing,
          running: r.running,
          throwing: r.throwing,
          recovery: r.recovery,
          catcherAbility: r.catcher_ability,
          // Pitcher attrs
          velocity: r.velocity,
          control: r.control,
          stamina: r.stamina,
          stuff: r.stuff,
          wRISP: r.w_risp,
          vsLefty: r.vs_lefty,
          poise: r.poise,
          heater: r.heater,
          agile: r.agile,
          // Pitch mix
          pitchFB: r.pitch_fb,
          pitch2S: r.pitch_2s,
          pitchSL: r.pitch_sl,
          pitchCB: r.pitch_cb,
          pitchCH: r.pitch_ch,
          pitchCT: r.pitch_ct,
          pitchSNK: r.pitch_snk,
          pitchSPL: r.pitch_spl,
          pitchSHU: r.pitch_shu,
          pitchCCH: r.pitch_cch,
          pitchHSL: r.pitch_hsl,
          pitchSWP: r.pitch_swp,
          pitchKN: r.pitch_kn,
          pitchVSL: r.pitch_vsl,
          pitchSFF: r.pitch_sff,
          pitchFK: r.pitch_fk,
          pitchSCB: r.pitch_scb,
          pitchPCB: r.pitch_pcb,
          abilities: r.abilities ?? [],
          editorVersion: r.editor_version ?? 1,
          skinTone: r.skin_tone,
          hairColor: r.hair_color,
          hairStyle: r.hair_style,
          facialHair: r.facial_hair,
        })),
        total,
        page,
        pageSize,
      });
    } catch (err) {
      console.error("[editor] GET players error:", err);
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  // ── PATCH /editor/schools/:teamId ───────────────────────────────────────────
  app.patch("/api/leagues/:id/editor/schools/:teamId", requireAuth, requireCommissioner, async (req, res) => {
    const client = await pool.connect();
    try {
      const leagueId = req.params.id as string;
      const teamId = req.params.teamId as string;
      const userId = req.session.userId!;

      // Parse and validate meta
      const metaParsed = PATCH_META_SCHEMA.safeParse(req.body);
      if (!metaParsed.success) {
        return res.status(400).json({ message: "Invalid patch body", errors: metaParsed.error.flatten() });
      }
      const { expectedVersion, changes, reason, effectiveSeason, idempotencyKey } = metaParsed.data;

      // Idempotency check
      const { rows: existingBatch } = await client.query(
        `SELECT id FROM league_edit_batches WHERE league_id = $1 AND idempotency_key = $2`,
        [leagueId, idempotencyKey],
      );
      if (existingBatch.length > 0) {
        return res.json({ batchId: existingBatch[0].id, idempotent: true });
      }

      // Validate changes against allowlists
      const allFieldKeys = Object.keys(changes);
      const forbidden = allFieldKeys.filter(k => !TEAM_IDENTITY_FIELDS.has(k) && !TEAM_COMPETITIVE_FIELDS.has(k));
      if (forbidden.length > 0) {
        return res.status(400).json({ message: `Forbidden or unknown fields: ${forbidden.join(", ")}` });
      }

      const hasCompetitive = allFieldKeys.some(k => TEAM_COMPETITIVE_FIELDS.has(k));

      // Validate competitive gate
      if (hasCompetitive) {
        const league = await storage.getLeague(leagueId);
        if (!(league as any)?.commissionerCompetitiveEditsEnabled) {
          return res.status(403).json({ message: "Competitive edits are disabled for this league" });
        }
      }

      // Validate field values
      const parsed = TEAM_ALL_SCHEMA.safeParse(changes);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid field values", errors: parsed.error.flatten() });
      }
      const validChanges = parsed.data as Record<string, unknown>;

      await client.query("BEGIN");

      // Lock row and check version
      const { rows: teamRows } = await client.query(
        `SELECT *, editor_version FROM teams WHERE id = $1 AND league_id = $2 FOR UPDATE`,
        [teamId, leagueId],
      );
      if (teamRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Team not found" });
      }
      const team = teamRows[0];
      const currentVersion = team.editor_version ?? 1;
      if (currentVersion !== expectedVersion) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Version conflict — team was modified by another session",
          currentVersion,
          expectedVersion,
        });
      }

      // Build before values for audit
      const beforeValues: Record<string, unknown> = {};
      for (const key of allFieldKeys) {
        const col = toSnake(key);
        beforeValues[key] = team[col] ?? null;
      }

      // Apply changes (bump version)
      const { setClause, values } = buildSetClause(validChanges);
      const nextVersion = currentVersion + 1;
      await client.query(
        `UPDATE teams SET ${setClause}, editor_version = $${values.length + 1} WHERE id = $${values.length + 2}`,
        [...values, nextVersion, teamId],
      );

      // Create audit batch
      const { rows: batchRows } = await client.query(
        `INSERT INTO league_edit_batches (league_id, actor_id, entity_type, entity_id, reason, effective_season, idempotency_key)
         VALUES ($1, $2, 'team', $3, $4, $5, $6) RETURNING id`,
        [leagueId, userId, teamId, reason, effectiveSeason ?? null, idempotencyKey],
      );
      const batchId = batchRows[0].id as string;

      // Create per-field change rows
      for (const key of allFieldKeys) {
        const newVal = validChanges[key];
        if (beforeValues[key] !== newVal) {
          await client.query(
            `INSERT INTO league_edit_changes (batch_id, field_name, before_json, after_json) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
            [batchId, key, JSON.stringify(beforeValues[key]), JSON.stringify(newVal)],
          );
        }
      }

      await client.query("COMMIT");
      invalidateLeague(leagueId);

      // Re-fetch updated team
      const updated = await storage.getTeam(teamId);
      res.json({ team: updated, batchId, editorVersion: nextVersion });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[editor] PATCH schools error:", err);
      res.status(500).json({ message: "Failed to update school" });
    } finally {
      client.release();
    }
  });

  // ── PATCH /editor/players/:playerId ────────────────────────────────────────
  app.patch("/api/leagues/:id/editor/players/:playerId", requireAuth, requireCommissioner, async (req, res) => {
    const client = await pool.connect();
    try {
      const leagueId = req.params.id as string;
      const playerId = req.params.playerId as string;
      const userId = req.session.userId!;

      const metaParsed = PATCH_META_SCHEMA.safeParse(req.body);
      if (!metaParsed.success) {
        return res.status(400).json({ message: "Invalid patch body", errors: metaParsed.error.flatten() });
      }
      const { expectedVersion, changes, reason, effectiveSeason, idempotencyKey } = metaParsed.data;

      // Idempotency check
      const { rows: existingBatch } = await client.query(
        `SELECT id FROM league_edit_batches WHERE league_id = $1 AND idempotency_key = $2`,
        [leagueId, idempotencyKey],
      );
      if (existingBatch.length > 0) {
        return res.json({ batchId: existingBatch[0].id, idempotent: true });
      }

      // Validate changes
      const allFieldKeys = Object.keys(changes);
      const identityKeys = new Set(Object.keys(PLAYER_IDENTITY_SCHEMA.shape));
      const competitiveKeys = new Set(Object.keys(PLAYER_COMPETITIVE_SCHEMA.shape));
      const forbidden = allFieldKeys.filter(k => !identityKeys.has(k) && !competitiveKeys.has(k));
      if (forbidden.length > 0) {
        return res.status(400).json({ message: `Forbidden or unknown fields: ${forbidden.join(", ")}` });
      }

      const parsed = PLAYER_ALL_SCHEMA.safeParse(changes);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid field values", errors: parsed.error.flatten() });
      }
      const validChanges = parsed.data as Record<string, unknown>;

      await client.query("BEGIN");

      // Lock row + verify league scope
      const { rows: playerRows } = await client.query(
        `SELECT p.*, p.editor_version FROM players p
         JOIN teams t ON t.id = p.team_id
         WHERE p.id = $1 AND t.league_id = $2 FOR UPDATE OF p`,
        [playerId, leagueId],
      );
      if (playerRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Player not found in this league" });
      }
      const player = playerRows[0];
      const currentVersion = player.editor_version ?? 1;
      if (currentVersion !== expectedVersion) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Version conflict — player was modified by another session",
          currentVersion,
          expectedVersion,
        });
      }

      // Before values for audit
      const beforeValues: Record<string, unknown> = {};
      for (const key of allFieldKeys) {
        const col = toSnake(key);
        beforeValues[key] = player[col] ?? null;
      }

      // Merge to compute new OVR
      const merged = { ...player } as Record<string, unknown>;
      for (const [key, val] of Object.entries(validChanges)) {
        merged[toSnake(key)] = val;
      }
      const newOvr = calculateOVR(merged as any);
      const newStar = getStarRatingFromOVR(newOvr);

      // Apply changes + OVR + version bump
      const { setClause, values } = buildSetClause({ ...validChanges, overall: newOvr, starRating: newStar });
      const nextVersion = currentVersion + 1;
      await client.query(
        `UPDATE players SET ${setClause}, editor_version = $${values.length + 1} WHERE id = $${values.length + 2}`,
        [...values, nextVersion, playerId],
      );

      // Create batch
      const { rows: batchRows } = await client.query(
        `INSERT INTO league_edit_batches (league_id, actor_id, entity_type, entity_id, reason, effective_season, idempotency_key)
         VALUES ($1, $2, 'player', $3, $4, $5, $6) RETURNING id`,
        [leagueId, userId, playerId, reason, effectiveSeason ?? null, idempotencyKey],
      );
      const batchId = batchRows[0].id as string;

      // Per-field changes
      const allWithOvr = { ...validChanges, overall: newOvr, starRating: newStar };
      const beforeWithOvr = { ...beforeValues, overall: player.overall, starRating: player.star_rating };
      for (const key of Object.keys(allWithOvr)) {
        const newVal = (allWithOvr as any)[key];
        const oldVal = (beforeWithOvr as any)[key] ?? null;
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          await client.query(
            `INSERT INTO league_edit_changes (batch_id, field_name, before_json, after_json) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
            [batchId, key, JSON.stringify(oldVal), JSON.stringify(newVal)],
          );
        }
      }

      await client.query("COMMIT");
      invalidateLeague(leagueId);

      const updated = await storage.getPlayer(playerId);
      res.json({ player: updated, batchId, editorVersion: nextVersion, newOvr, newStar });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[editor] PATCH players error:", err);
      res.status(500).json({ message: "Failed to update player" });
    } finally {
      client.release();
    }
  });

  // ── GET /editor/history ─────────────────────────────────────────────────────
  app.get("/api/leagues/:id/editor/history", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;

      // Check access: must be a league member (commissioner or enrolled coach).
      // If not commissioner, additionally requires auditLogPublic to be true.
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const isCommissioner = hasCommissionerAccess(league, userId);

      if (!isCommissioner) {
        // Verify the user is actually a member of this league
        const leagueCoaches = await storage.getCoachesByLeague(leagueId);
        const isMember = leagueCoaches.some((c: { userId?: string | null }) => c.userId === userId);
        if (!isMember) {
          return res.status(403).json({ message: "Not a member of this league" });
        }
        if (!(league as any).auditLogPublic) {
          return res.status(403).json({ message: "Audit log is private" });
        }
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, parseInt(req.query.pageSize as string) || 20);
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const offset = (page - 1) * pageSize;

      let whereClause = `WHERE b.league_id = $1`;
      const params: unknown[] = [leagueId];
      let idx = 2;
      if (entityType) { whereClause += ` AND b.entity_type = $${idx++}`; params.push(entityType); }
      if (entityId)   { whereClause += ` AND b.entity_id = $${idx++}`; params.push(entityId); }

      const { rows: batches } = await pool.query(`
        SELECT b.*,
               u.email as actor_email,
               COALESCE(t.name, p.first_name || ' ' || p.last_name) as entity_label
        FROM league_edit_batches b
        LEFT JOIN users u ON u.id = b.actor_id
        LEFT JOIN teams t ON t.id = b.entity_id AND b.entity_type = 'team'
        LEFT JOIN players p ON p.id = b.entity_id AND b.entity_type = 'player'
        ${whereClause}
        ORDER BY b.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...params, pageSize, offset]);

      const { rows: countRows } = await pool.query(
        `SELECT count(*) FROM league_edit_batches b ${whereClause}`,
        params.slice(0, idx - 3),
      );
      const total = parseInt(countRows[0].count);

      // Fetch changes for each batch
      const batchIds = batches.map((b: any) => b.id);
      let changes: any[] = [];
      if (batchIds.length > 0) {
        const placeholders = batchIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
        const { rows } = await pool.query(
          `SELECT * FROM league_edit_changes WHERE batch_id IN (${placeholders}) ORDER BY field_name`,
          batchIds,
        );
        changes = rows;
      }

      const changesByBatch: Record<string, any[]> = {};
      for (const c of changes) {
        if (!changesByBatch[c.batch_id]) changesByBatch[c.batch_id] = [];
        changesByBatch[c.batch_id].push({
          id: c.id,
          fieldName: c.field_name,
          beforeJson: c.before_json,
          afterJson: c.after_json,
        });
      }

      res.json({
        batches: batches.map((b: any) => ({
          id: b.id,
          leagueId: b.league_id,
          actorId: b.actor_id,
          actorEmail: b.actor_email,
          entityType: b.entity_type,
          entityId: b.entity_id,
          entityLabel: b.entity_label,
          reason: b.reason,
          effectiveSeason: b.effective_season,
          isReversed: b.is_reversed,
          reversedByBatchId: b.reversed_by_batch_id,
          createdAt: b.created_at,
          changes: changesByBatch[b.id] ?? [],
        })),
        total,
        page,
        pageSize,
      });
    } catch (err) {
      console.error("[editor] GET history error:", err);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // ── POST /editor/batches/:batchId/reverse ───────────────────────────────────
  app.post("/api/leagues/:id/editor/batches/:batchId/reverse", requireAuth, requireCommissioner, async (req, res) => {
    const client = await pool.connect();
    try {
      const leagueId = req.params.id as string;
      const batchId = req.params.batchId as string;
      const userId = req.session.userId!;
      const reason = (req.body?.reason as string) || "Reversal";

      const { rows: batchRows } = await client.query(
        `SELECT * FROM league_edit_batches WHERE id = $1 AND league_id = $2`,
        [batchId, leagueId],
      );
      if (batchRows.length === 0) {
        return res.status(404).json({ message: "Batch not found" });
      }
      const batch = batchRows[0];
      if (batch.is_reversed) {
        return res.status(409).json({ message: "This batch has already been reversed" });
      }

      const { rows: changeRows } = await client.query(
        `SELECT * FROM league_edit_changes WHERE batch_id = $1`,
        [batchId],
      );
      if (changeRows.length === 0) {
        return res.status(400).json({ message: "No changes found in this batch" });
      }

      await client.query("BEGIN");

      // Apply before_json values back to the entity
      const table = batch.entity_type === "team" ? "teams" : "players";
      const idCol = "id";

      for (const change of changeRows) {
        const colName = toSnake(change.field_name);
        const restoreVal = change.before_json === null ? null : change.before_json;
        await client.query(
          `UPDATE ${table} SET ${colName} = $1 WHERE ${idCol} = $2`,
          [typeof restoreVal === "object" && restoreVal !== null ? JSON.stringify(restoreVal) : restoreVal, batch.entity_id],
        );
      }

      // Bump editor_version on entity
      await client.query(
        `UPDATE ${table} SET editor_version = COALESCE(editor_version, 1) + 1 WHERE id = $1`,
        [batch.entity_id],
      );

      // Recompute OVR if reversing a player batch
      if (batch.entity_type === "player") {
        const { rows: pRows } = await client.query(`SELECT * FROM players WHERE id = $1`, [batch.entity_id]);
        if (pRows.length > 0) {
          const p = pRows[0];
          const newOvr = calculateOVR(p as any);
          const newStar = getStarRatingFromOVR(newOvr);
          await client.query(`UPDATE players SET overall = $1, star_rating = $2 WHERE id = $3`, [newOvr, newStar, batch.entity_id]);
        }
      }

      // Create reversal batch
      const idempotencyKey = `reversal-${batchId}-${Date.now()}`;
      const { rows: revBatchRows } = await client.query(
        `INSERT INTO league_edit_batches (league_id, actor_id, entity_type, entity_id, reason, effective_season, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [leagueId, userId, batch.entity_type, batch.entity_id, reason, batch.effective_season, idempotencyKey],
      );
      const revBatchId = revBatchRows[0].id;

      // Mark original as reversed
      await client.query(
        `UPDATE league_edit_batches SET is_reversed = true, reversed_by_batch_id = $1 WHERE id = $2`,
        [revBatchId, batchId],
      );

      // Create reversal change rows (swap before/after)
      for (const change of changeRows) {
        await client.query(
          `INSERT INTO league_edit_changes (batch_id, field_name, before_json, after_json) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
          [revBatchId, change.field_name, JSON.stringify(change.after_json), JSON.stringify(change.before_json)],
        );
      }

      await client.query("COMMIT");
      invalidateLeague(leagueId);

      res.json({ reversalBatchId: revBatchId, message: "Reversal applied" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[editor] POST reverse error:", err);
      res.status(500).json({ message: "Failed to reverse batch" });
    } finally {
      client.release();
    }
  });
}
