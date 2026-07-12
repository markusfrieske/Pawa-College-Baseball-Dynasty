import { z } from "zod";
import { FULL_SEASON_RULES } from "./catalog";

export type DynastyPreset = "custom" | "full_season";

export const leagueRulesSnapshotSchema = z.object({
  maxTeams:           z.number().int().positive(),
  conferenceCount:    z.number().int().positive(),
  seasonLength:       z.enum(["short", "medium", "standard", "long", "full_season"]),
  progressionEnabled: z.boolean(),
  gameMode:           z.enum(["simulated", "reported"]),
  catalogVersion:     z.string().optional(),
});

export type LeagueRulesSnapshot = z.infer<typeof leagueRulesSnapshotSchema>;

export const FULL_SEASON_RULES_SNAPSHOT: LeagueRulesSnapshot = {
  maxTeams:           FULL_SEASON_RULES.maxTeams,
  conferenceCount:    FULL_SEASON_RULES.conferenceCount,
  seasonLength:       FULL_SEASON_RULES.seasonLength,
  progressionEnabled: FULL_SEASON_RULES.progressionEnabled,
  gameMode:           FULL_SEASON_RULES.gameMode,
  catalogVersion:     FULL_SEASON_RULES.catalogVersion,
};
