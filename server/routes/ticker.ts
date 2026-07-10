/**
 * League Ticker — GET /api/leagues/:id/ticker
 *
 * Filtered, paginated view of league_events with per-user read-state.
 * POST /api/leagues/:id/ticker/mark-read  → stamp lastReadAt for the caller.
 *
 * Filter values: all | games | recruiting | storylines | commissioner | myteam
 * Privacy: gem/bust/scouting flags are stripped from metadata unless the
 *          caller is the league commissioner.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, hasCommissionerAccess, resolveUserTeam } from "../route-helpers";

// ── Filter → event-type mapping ────────────────────────────────────────────
const FILTER_TYPES: Record<string, string[]> = {
  games: ["GAME_RESULT", "RIVALRY_RESULT", "GAME_REPORT"],
  recruiting: ["SIGNING", "DECOMMIT", "TRANSFER", "WALKON"],
  storylines: ["STORYLINE", "STORYLINE_ABILITY"],
  commissioner: ["PHASE_CHANGE", "AWARD", "PROGRAM_ATTR_CHANGE", "ROSTER_CUT", "DRAFT", "NUDGE"],
};

// Keys stripped from metadata in the public feed to protect fog-of-war
const PRIVATE_META_KEYS = new Set([
  "isGenerationalGem", "isGenerationalBust", "isBust", "isGem",
  "gemOvr", "bustOvr", "trueOvr", "scoutedPct",
]);

function scrubMetadata(
  metadata: Record<string, unknown> | null | undefined,
  isCommissioner: boolean,
): Record<string, unknown> | null {
  if (!metadata) return null;
  if (isCommissioner) return metadata;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (!PRIVATE_META_KEYS.has(k)) clean[k] = v;
  }
  return clean;
}

export function registerTickerRoutes(app: Express): void {
  // ── GET /api/leagues/:id/ticker ──────────────────────────────────────────
  app.get("/api/leagues/:id/ticker", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const isCommissioner = hasCommissionerAccess(league, userId);

      // Resolve caller's team so we can support the "myteam" filter
      const [teams, coaches] = await Promise.all([
        storage.getTeamsByLeague(leagueId),
        storage.getCoachesByLeague(leagueId),
      ]);
      const { userTeam } = resolveUserTeam(coaches, teams, userId);

      // Parse query params
      const filter = (req.query.filter as string | undefined) ?? "all";
      const limitRaw = parseInt((req.query.limit as string | undefined) ?? "50", 10);
      const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);
      const offsetRaw = parseInt((req.query.offset as string | undefined) ?? "0", 10);
      const offset = Math.max(0, isNaN(offsetRaw) ? 0 : offsetRaw);
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam ? new Date(sinceParam) : undefined;

      // Build feed query opts
      let eventTypes: string[] | undefined;
      let filterTeamId: string | undefined;

      if (filter === "myteam") {
        filterTeamId = userTeam?.id;
      } else if (filter !== "all" && FILTER_TYPES[filter]) {
        eventTypes = FILTER_TYPES[filter];
      }
      // For "all", exclude NUDGE (too noisy) unless explicitly requesting commissioner filter
      if (filter === "all") {
        eventTypes = [
          "GAME_RESULT", "RIVALRY_RESULT", "GAME_REPORT",
          "SIGNING", "DECOMMIT", "TRANSFER", "WALKON",
          "STORYLINE", "STORYLINE_ABILITY",
          "PHASE_CHANGE", "AWARD", "PROGRAM_ATTR_CHANGE", "ROSTER_CUT", "DRAFT",
        ];
      }

      const events = await storage.getTickerFeed({
        leagueId,
        eventTypes,
        teamId: filterTeamId,
        since,
        limit,
        offset,
      });

      // Read-state: fetch lastReadAt for unread count computation
      const tickerRead = await storage.getTickerRead(leagueId, userId);
      const lastReadAt = tickerRead?.lastReadAt ?? null;

      // Unread count: events newer than lastReadAt (cap at 99+)
      let unreadCount = 0;
      if (lastReadAt) {
        unreadCount = await storage.getTickerUnreadCount(leagueId, lastReadAt);
      } else {
        // Never visited — everything is "new"
        unreadCount = Math.min(events.length, 99);
      }

      // Scrub private metadata
      const safeEvents = events.map(e => ({
        ...e,
        metadata: scrubMetadata(e.metadata as Record<string, unknown> | null, isCommissioner),
      }));

      res.json({
        events: safeEvents,
        unreadCount,
        lastReadAt: lastReadAt?.toISOString() ?? null,
        filter,
        hasMore: events.length === limit,
      });
    } catch (err) {
      console.error("[ticker] GET failed:", err);
      res.status(500).json({ message: "Failed to load ticker" });
    }
  });

  // ── POST /api/leagues/:id/ticker/mark-read ─────────────────────────────
  app.post("/api/leagues/:id/ticker/mark-read", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const userId = req.session.userId!;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      await storage.upsertTickerRead(leagueId, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[ticker] mark-read failed:", err);
      res.status(500).json({ message: "Failed to mark read" });
    }
  });
}
