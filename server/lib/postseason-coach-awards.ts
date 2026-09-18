import { and, eq, sql } from "drizzle-orm";
import { coaches, leagues, teams, postseasonCoachAwards, postseasonAwardLegacySeasons, type Coach } from "@shared/schema";
import { hasPerk, XP_AWARDS } from "@shared/coachPerks";
import { db } from "../db";
import { computeLegacyScore } from "../game-engine";
import { invalidateLeague } from "../cache";

export type PostseasonMilestone = "conf_champ" | "cws_appearance" | "cws_win";
export class PostseasonAwardConflict extends Error {}
export class PostseasonAwardReconciliationRequired extends Error {}

const milestoneRules = {
  conf_champ: { field: "confChampionships", xp: XP_AWARDS.CONF_CHAMP },
  cws_appearance: { field: "cwsAppearances", xp: XP_AWARDS.CWS_APPEARANCE },
  cws_win: { field: "nationalChampionships", xp: XP_AWARDS.CWS_WIN },
} as const;
const observe = (coach: Coach) => ({
  xp: coach.xp, level: coach.level, skillPoints: coach.skillPoints,
  confChampionships: coach.confChampionships, cwsAppearances: coach.cwsAppearances,
  nationalChampionships: coach.nationalChampionships, legacyScore: coach.legacyScore,
  perks: coach.perks,
});

/**
 * Internal service called with winners from the authoritative postseason path.
 * The receipt makes that supplied milestone durable; it does not certify bracket
 * selection rules or permit a client to nominate its own winner.
 */
export async function awardPostseasonCoachMilestone(input: {
  leagueId: string; season: number; teamId: string; milestone: PostseasonMilestone; sourceKey: string;
}) {
  if (!Number.isSafeInteger(input.season) || input.season < 1 || !input.sourceKey?.trim() || !Object.hasOwn(milestoneRules, input.milestone)) {
    throw new PostseasonAwardConflict("Invalid postseason milestone identity.");
  }
  const result = await db.transaction(async tx => {
    const leagueLock = await tx.execute(sql`SELECT id FROM leagues WHERE id = ${input.leagueId} FOR KEY SHARE`);
    if (!leagueLock.rows.length) throw new PostseasonAwardConflict("League is no longer available.");
    // Same projection lock as finalizeGameAtomic: game and milestone awards do
    // not overwrite each other's observed coach state.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1885435745, hashtext(${input.leagueId}))`);
    const identity = and(eq(postseasonCoachAwards.leagueId, input.leagueId),
      eq(postseasonCoachAwards.season, input.season), eq(postseasonCoachAwards.teamId, input.teamId),
      eq(postseasonCoachAwards.milestone, input.milestone));
    const [existing] = await tx.select().from(postseasonCoachAwards).where(identity);
    if (existing) {
      if (existing.sourceKey !== input.sourceKey) throw new PostseasonAwardConflict("This milestone already has a different source.");
      return { alreadyAwarded: true, receipt: existing };
    }
    const [legacy] = await tx.select().from(postseasonAwardLegacySeasons).where(and(
      eq(postseasonAwardLegacySeasons.leagueId, input.leagueId), eq(postseasonAwardLegacySeasons.season, input.season)));
    if (legacy) throw new PostseasonAwardReconciliationRequired("Legacy postseason awards need reconciliation before this season can advance. Existing coach records and XP are unchanged.");
    const [league] = await tx.select({ season: leagues.currentSeason }).from(leagues).where(eq(leagues.id, input.leagueId));
    if (league.season !== input.season) throw new PostseasonAwardConflict("A new milestone must belong to the league's current season.");
    const [team] = await tx.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.leagueId, input.leagueId)));
    if (!team) throw new PostseasonAwardConflict("Milestone team is not available in this league.");
    const base = { leagueId: input.leagueId, season: input.season, teamId: input.teamId, milestone: input.milestone, sourceKey: input.sourceKey };
    if (!team.coachId) {
      const [receipt] = await tx.insert(postseasonCoachAwards).values({ ...base, coachId: null, disposition: "no_coach",
        milestoneDelta: 0, xpDelta: 0, skillPointsDelta: 0, beforeState: {}, afterState: {} }).returning();
      return { alreadyAwarded: false, receipt };
    }
    await tx.execute(sql`SELECT id FROM coaches WHERE id = ${team.coachId} FOR UPDATE`);
    const [coach] = await tx.select().from(coaches).where(eq(coaches.id, team.coachId));
    if (!coach || coach.leagueId !== input.leagueId || coach.teamId !== team.id) {
      throw new PostseasonAwardConflict("Assigned milestone coach is not available for this team.");
    }
    const rule = milestoneRules[input.milestone];
    const xpDelta = rule.xp + (hasPerk(coach, "gm_playoff_poise") ? XP_AWARDS.PLAYOFF_POISE_BONUS : 0)
      + (input.milestone !== "conf_champ" && hasPerk(coach, "gm_legendary") ? XP_AWARDS.LEGENDARY_CWS_BONUS : 0);
    const xp = coach.xp + xpDelta;
    const level = Math.floor(xp / 1000) + 1;
    const skillPointsDelta = Math.max(0, level - coach.level) + (input.milestone === "conf_champ" && hasPerk(coach, "gm_legendary") ? 1 : 0);
    const milestoneValue = coach[rule.field] + 1;
    const [updated] = await tx.update(coaches).set({ xp, level, skillPoints: coach.skillPoints + skillPointsDelta,
      [rule.field]: milestoneValue, legacyScore: computeLegacyScore({ ...coach, [rule.field]: milestoneValue }),
    }).where(eq(coaches.id, coach.id)).returning();
    const [receipt] = await tx.insert(postseasonCoachAwards).values({ ...base, coachId: coach.id, disposition: "awarded",
      milestoneDelta: 1, xpDelta, skillPointsDelta, beforeState: observe(coach), afterState: observe(updated),
    }).returning();
    return { alreadyAwarded: false, receipt };
  });
  if (!result.alreadyAwarded) invalidateLeague(input.leagueId);
  return result;
}
