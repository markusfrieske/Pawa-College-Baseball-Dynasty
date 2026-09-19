import type { PoolClient } from "pg";
import type { Express } from "express";
import { pool } from "../db";
import { requireAuth } from "../route-helpers";
import { isPitcher } from "@shared/positions";

const contracts = {
  "depth-chart": { body: "orders", field: "depthOrder", column: "depth_order" },
  "batting-order": { body: "orders", field: "battingOrder", column: "batting_order" },
  "lineup-position": { body: "assignments", field: "lineupPosition", column: "lineup_position" },
  "pitching-roles": { body: "assignments", field: "pitchingRole", column: "pitching_role" },
} as const;
const positions = new Set(["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"]);
const roles = new Set(["FRI", "SAT", "SUN", "MID", "LRP", "MR", "MR1", "MR2", "MR3", "SU", "CP"]);
class LineupError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Manual roster assignments: authorize the complete request, lock, validate final state, then commit once. */
export function registerLineupRoutes(app: Express) {
  for (const [route, contract] of Object.entries(contracts)) app.put(`/api/leagues/:id/${route}`, requireAuth, async (req, res) => {
    const items = req.body?.[contract.body];
    const field = contract.field;
    if (!Array.isArray(items) || items.length > 100 || items.some(item => !item || typeof item !== "object" || Array.isArray(item) || typeof item.playerId !== "string" || !item.playerId || Object.keys(item).some(k => k !== "playerId" && k !== field))) {
      return res.status(400).json({ message: "Expected at most 100 player assignments with supported fields" });
    }
    if (new Set(items.map(item => item.playerId)).size !== items.length) return res.status(400).json({ message: "Each player must occur once" });
    for (const item of items) {
      const value = item[field];
      const valid = field === "depthOrder" ? Number.isInteger(value) && value >= 0 && value <= 100 : value === null || (field === "battingOrder" ? Number.isInteger(value) && value >= 1 && value <= 9 : typeof value === "string" && (field === "pitchingRole" ? roles : positions).has(value));
      if (!valid) return res.status(400).json({ message: `Invalid ${field}` });
    }
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const league = (await client.query("SELECT commissioner_id, co_commissioner_ids FROM leagues WHERE id=$1 FOR SHARE", [req.params.id])).rows[0];
      if (!league) throw new LineupError(404, "League not found");
      const commissioner = league.commissioner_id === req.session.userId || (Array.isArray(league.co_commissioner_ids) && league.co_commissioner_ids.includes(req.session.userId));
      const coaches = (await client.query("SELECT team_id FROM coaches WHERE league_id=$1 AND user_id=$2 FOR SHARE", [req.params.id, req.session.userId])).rows;
      if (!commissioner && !coaches.length) throw new LineupError(403, "Not authorized");
      // Stable lock order across all four manual endpoints. This also locks empty teams.
      const teams = (await client.query("SELECT id FROM teams WHERE league_id=$1 ORDER BY id FOR UPDATE", [req.params.id])).rows;
      const teamIds = teams.map(t => t.id);
      const roster = (await client.query("SELECT * FROM players WHERE team_id=ANY($1::text[]) ORDER BY id FOR UPDATE", [teamIds])).rows;
      const before = roster.map(p => ({ ...p }));
      const ownTeams = new Set(coaches.map(c => c.team_id));
      const affected = new Set<string>();
      for (const item of items) {
        const player = roster.find(p => p.id === item.playerId);
        if (!player) throw new LineupError(404, "Player is not in this league");
        if (!commissioner && !ownTeams.has(player.team_id)) throw new LineupError(403, "Player is not on your team");
        if (field === "pitchingRole" && !isPitcher(player.position)) throw new LineupError(400, "Pitching roles require a pitcher");
        if ((field === "battingOrder" || field === "lineupPosition") && isPitcher(player.position)) throw new LineupError(400, "This lineup slot requires a position player");
        player[contract.column] = item[field];
        affected.add(player.team_id);
      }
      for (const teamId of affected) {
        const team = roster.filter(p => p.team_id === teamId);
        if (field === "battingOrder" || field === "pitchingRole" || field === "lineupPosition") {
          const relevant = field === "lineupPosition" ? team.filter(p => p.batting_order != null) : team;
          const values = relevant.map(p => p[contract.column]).filter(v => v != null && !(field === "pitchingRole" && v === "MR"));
          // Legacy generic MR is a shared pool; named MR1/2/3 are singular slots.
          const prior = before.filter(p => p.team_id === teamId && (field !== "lineupPosition" || p.batting_order != null)).map(p => p[contract.column]).filter(v => v != null && !(field === "pitchingRole" && v === "MR"));
          const conflicts = (list: unknown[]) => list.length - new Set(list).size;
          const introducesConflict = values.some(v => values.filter(x => x === v).length > Math.max(1, prior.filter(x => x === v).length));
          // A single-slot repair may strictly reduce old conflicts without creating new ones.
          if (conflicts(values) && (introducesConflict || conflicts(values) >= conflicts(prior))) throw new LineupError(409, "Conflicting assignments remain. Review the affected lineup before saving.");
        }
      }
      for (const item of items) await client.query(`UPDATE players SET ${contract.column}=$1 WHERE id=$2`, [item[field], item.playerId]);
      await client.query("COMMIT");
      res.json({ success: true, count: items.length });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error instanceof LineupError) res.status(error.status).json({ message: error.message });
      else { console.error("Manual lineup update failed", error); res.status(500).json({ message: "Lineup was not saved" }); }
    } finally { client?.release(); }
  });
}
