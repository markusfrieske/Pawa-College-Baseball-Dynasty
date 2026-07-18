import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  coaches,
  recruitingActionsLog,
  recruitingInterests,
  recruits,
  type RecruitingInterest,
} from "@shared/schema";
import { getAttributesToReveal, getAttributesToRevealCount, SCOUT_ATTRS } from "../recruit-engine";

export class RecruitingTransactionError extends Error {
  constructor(
    public readonly code: "CAP_REACHED" | "NO_VALID_RECRUITS" | "RECRUIT_NOT_FOUND" | "COACH_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "RecruitingTransactionError";
  }
}

export interface ScoutItem {
  recruitId: string;
  revealAmount: number;
  potentialNarrowMultiplier: number;
}

function narrowRange(
  min: number,
  max: number,
  actual: number,
  pct: number,
  multiplier: number,
): { newMin: number; newMax: number } {
  const cappedPct = Math.min(pct, 60);
  const effectivePct = Math.min(100, cappedPct * multiplier);
  const newRange = Math.max(0, (max - min) * (1 - (effectivePct / 100) * 0.8));
  const halfRange = Math.floor(newRange / 2);
  let newMin = Math.max(1, Math.max(min, actual - halfRange));
  let newMax = Math.min(max, actual + halfRange);
  if (newMax - newMin < 150) {
    let adjustedMin = Math.max(1, actual - 75);
    const adjustedMax = Math.min(999, adjustedMin + 150);
    if (adjustedMax - adjustedMin < 150) adjustedMin = Math.max(1, adjustedMax - 150);
    newMin = adjustedMin;
    newMax = adjustedMax;
  }
  return { newMin, newMax };
}

function narrowStarRange(min: number, max: number, actual: number, pct: number) {
  if (pct >= 75) return { newMin: actual, newMax: actual };
  if (pct >= 50) return { newMin: Math.max(1, actual - 1), newMax: Math.min(5, actual + 1) };
  if (pct >= 25) return { newMin: Math.max(1, actual - 2), newMax: Math.min(5, actual + 2) };
  return { newMin: min, newMax: max };
}

export async function scoutRecruitsTransactional(input: {
  leagueId: string;
  teamId: string;
  coachId: string;
  maxActions: number;
  week: number;
  season: number;
  items: ScoutItem[];
}): Promise<{ interests: RecruitingInterest[]; skipped: number }> {
  return db.transaction(async (tx) => {
    // One team-scoped economy lock serializes target/scout budget operations,
    // including the "no interest row yet" case that row locks cannot protect.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recruiting:${input.leagueId}:${input.teamId}`}, 0))`);

    await tx.execute(sql`SELECT id FROM coaches WHERE id = ${input.coachId} AND league_id = ${input.leagueId} FOR UPDATE`);
    const [lockedCoach] = await tx.select({ used: coaches.scoutActionsUsed }).from(coaches)
      .where(and(eq(coaches.id, input.coachId), eq(coaches.leagueId, input.leagueId)));
    if (!lockedCoach) throw new RecruitingTransactionError("COACH_NOT_FOUND", "Coach not found");

    const requestedIds = [...new Set(input.items.map(item => item.recruitId))];
    const validRows = requestedIds.length === 0 ? [] : await tx.select().from(recruits).where(and(
      eq(recruits.leagueId, input.leagueId),
      inArray(recruits.id, requestedIds),
    ));
    const validById = new Map(validRows.map(recruit => [recruit.id, recruit]));
    const available = Math.max(0, input.maxActions - (lockedCoach.used ?? 0));
    const selectedItems = input.items.filter(item => validById.has(item.recruitId)).slice(0, available);
    if (selectedItems.length === 0) {
      if (validRows.length === 0) throw new RecruitingTransactionError("NO_VALID_RECRUITS", "No valid recruits to scout");
      throw new RecruitingTransactionError("CAP_REACHED", `You've used all ${input.maxActions} scouting points this week`);
    }

    const reserved = await tx.update(coaches)
      .set({ scoutActionsUsed: sql`${coaches.scoutActionsUsed} + ${selectedItems.length}` })
      .where(and(
        eq(coaches.id, input.coachId),
        eq(coaches.leagueId, input.leagueId),
        sql`${coaches.scoutActionsUsed} + ${selectedItems.length} <= ${input.maxActions}`,
      ))
      .returning({ id: coaches.id });
    if (reserved.length !== 1) throw new RecruitingTransactionError("CAP_REACHED", "No scouting actions remaining");

    const results: RecruitingInterest[] = [];
    for (const item of selectedItems) {
      const recruit = validById.get(item.recruitId)!;
      const [current] = await tx.select().from(recruitingInterests).where(and(
        eq(recruitingInterests.recruitId, recruit.id),
        eq(recruitingInterests.teamId, input.teamId),
      ));
      const totalAbilities = (recruit.abilities as string[] | null)?.length ?? 0;
      let interest: RecruitingInterest;
      if (!current) {
        const ovr = narrowRange(1, 999, recruit.overall, item.revealAmount, item.potentialNarrowMultiplier);
        const stars = narrowStarRange(1, 5, recruit.starRating, item.revealAmount);
        [interest] = await tx.insert(recruitingInterests).values({
          recruitId: recruit.id,
          teamId: input.teamId,
          scoutPercentage: Math.min(100, item.revealAmount),
          revealedAttributes: getAttributesToReveal(Math.min(item.revealAmount, 60)),
          minOverall: ovr.newMin,
          maxOverall: ovr.newMax,
          minStar: stars.newMin,
          maxStar: stars.newMax,
          revealedAbilitiesCount: Math.min(totalAbilities, Math.floor(totalAbilities * Math.min(item.revealAmount, 50) / 100)),
        }).returning();
      } else {
        const newPct = Math.min(100, (current.scoutPercentage ?? 0) + item.revealAmount);
        const currentAttrs = (current.revealedAttributes as string[] | null) ?? [];
        const targetTotal = Math.floor(Math.min(newPct, 60) / 100 * SCOUT_ATTRS.length);
        const allAttrs = [
          ...currentAttrs,
          ...getAttributesToRevealCount(Math.max(0, targetTotal - currentAttrs.length), currentAttrs),
        ];
        const ovr = narrowRange(
          current.minOverall ?? 1,
          current.maxOverall ?? 999,
          recruit.overall,
          newPct,
          item.potentialNarrowMultiplier,
        );
        const stars = narrowStarRange(current.minStar ?? 1, current.maxStar ?? 5, recruit.starRating, newPct);
        [interest] = await tx.update(recruitingInterests).set({
          scoutPercentage: newPct,
          revealedAttributes: allAttrs,
          minOverall: ovr.newMin,
          maxOverall: ovr.newMax,
          minStar: stars.newMin,
          maxStar: stars.newMax,
          revealedAbilitiesCount: Math.min(totalAbilities, Math.floor(totalAbilities * Math.min(newPct, 50) / 100)),
        }).where(eq(recruitingInterests.id, current.id)).returning();
      }

      await tx.insert(recruitingActionsLog).values({
        recruitId: recruit.id,
        teamId: input.teamId,
        leagueId: input.leagueId,
        week: input.week,
        season: input.season,
        actionType: "scout",
        interestChange: 0,
        notes: `Scouted to ${interest.scoutPercentage}%`,
      });
      results.push(interest);
    }
    return { interests: results, skipped: input.items.length - results.length };
  });
}

export async function toggleRecruitTargetTransactional(input: {
  leagueId: string;
  teamId: string;
  recruitId: string;
  cap: number;
}): Promise<RecruitingInterest> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recruiting:${input.leagueId}:${input.teamId}`}, 0))`);
    const [recruit] = await tx.select({ id: recruits.id }).from(recruits).where(and(
      eq(recruits.id, input.recruitId),
      eq(recruits.leagueId, input.leagueId),
    ));
    if (!recruit) throw new RecruitingTransactionError("RECRUIT_NOT_FOUND", "Recruit not found in this league");
    const [current] = await tx.select().from(recruitingInterests).where(and(
      eq(recruitingInterests.recruitId, input.recruitId),
      eq(recruitingInterests.teamId, input.teamId),
    ));

    const wantToTarget = !current?.isTargeted;
    if (wantToTarget) {
      const targets = await tx.select({ id: recruitingInterests.id }).from(recruitingInterests).where(and(
        eq(recruitingInterests.teamId, input.teamId),
        eq(recruitingInterests.isTargeted, true),
      ));
      if (targets.length >= input.cap) {
        throw new RecruitingTransactionError("CAP_REACHED", `Maximum ${input.cap} targets reached. Remove a target first.`);
      }
    }

    if (!current) {
      const [created] = await tx.insert(recruitingInterests).values({
        recruitId: input.recruitId,
        teamId: input.teamId,
        isTargeted: true,
      }).returning();
      return created;
    }
    const [updated] = await tx.update(recruitingInterests)
      .set({ isTargeted: wantToTarget })
      .where(eq(recruitingInterests.id, current.id))
      .returning();
    return updated;
  });
}
