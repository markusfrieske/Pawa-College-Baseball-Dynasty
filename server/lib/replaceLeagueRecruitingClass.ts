/**
 * replaceLeagueRecruitingClass
 *
 * Single authoritative helper for replacing a league's entire recruit pool.
 * All mutations (delete old recruits + child rows, insert new recruits, create
 * storyline recruits, update vintage) are wrapped in a single DB transaction.
 * Any failure rolls back everything to the prior state — no partial outcomes.
 *
 * Responsibilities (in order):
 *  1. Capture a safety save state (optional, outside transaction).
 *  2. BEGIN TRANSACTION:
 *     a. Advisory lock on league row (serialises concurrent calls).
 *     b. Delete existing recruits and all child data (cascade order).
 *     c. Batch-insert the validated new recruits.
 *     d. If initStorylines=true (sync path): pick + insert storyline recruits.
 *     e. Update currentClassVintage.
 *     COMMIT (or ROLLBACK on any error — including storyline init failures).
 *  3. If initStorylines=true (sync path): generate initial arc events (best-effort, post-tx).
 *  4. If initStorylines=true (async path): fire-and-forget full init.
 *  5. Invalidate the league cache entry (always).
 *  6. Write an audit-log entry (optional).
 */

import { db } from "../db";
import {
  recruits as recruitsTable,
  recruitTopSchools,
  recruitingActionsLog,
  recruitingInterests,
  storylineRecruits,
  storylineEvents,
  storylineVotes,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { storage } from "../storage";
import type { InsertRecruit, InsertStorylineRecruit } from "@shared/schema";
import { captureLeagueSaveState, type SaveStateTrigger } from "./leagueSaveState";
import { pickStorylineRecruits, _setStorylineRng, _resetStorylineRng } from "../storylineEngine";
import { initializeStorylineRecruits, generateInitialStorylineEvents } from "../storyline-routes";
import { invalidateLeague } from "../cache";
import type { WizardStoryPlan } from "@shared/schema";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ReplaceClassOptions {
  leagueId: string;

  /**
   * Current (or upcoming) season number — used to key storyline recruit rows.
   */
  season: number;

  /**
   * Fully validated recruits, each already stamped with the correct leagueId.
   * The helper performs no additional validation.
   */
  recruits: InsertRecruit[];

  /**
   * If provided (even `null`), update league.currentClassVintage to this value.
   * Omit (leave `undefined`) to leave the existing vintage untouched.
   */
  vintage?: string | null;

  /**
   * Optional authored Story Plan from the Class Studio wizard.
   * Cast members with arcMode="template" have their archetype pinned.
   * Non-cast recruits receive randomly-assigned archetypes as usual.
   */
  storyPlan?: WizardStoryPlan;

  /**
   * When true, storyline recruits are created inside the same transaction as
   * the recruit pool.  Any failure rolls back the entire operation atomically.
   * Default: false (preserves prior behaviour for callers that never did it).
   */
  initStorylines?: boolean;

  /**
   * When true, the storyline-init call fires as a background promise after the
   * transaction commits (no await in the caller).  Only meaningful when
   * initStorylines is also true.  Default: false.
   */
  asyncStorylines?: boolean;

  /**
   * Starting week for initial arc event generation (post-tx best-effort).
   * Default: 1.
   */
  storyStartWeek?: number;

  /**
   * When provided, a snapshot is captured BEFORE any data is mutated.
   * Omit to skip the save-state step.
   */
  saveState?: {
    trigger: SaveStateTrigger;
    label: string;
    userId?: string | null;
  };

  /**
   * When provided, an audit-log row is written AFTER the insert succeeds.
   * Omit to skip auditing (e.g. internal pipeline steps).
   */
  audit?: {
    userId: string;
    action: string;
    details: string;
  };

  /**
   * Optional master seed for storyline RNG. When provided, _setStorylineRng
   * is called before pickStorylineRecruits so storyline selection is deterministic.
   */
  masterSeed?: string;
}

export interface ReplaceClassResult {
  /** Number of recruits actually inserted. */
  count: number;
}

// ── Implementation ────────────────────────────────────────────────────────────

export async function replaceLeagueRecruitingClass(
  opts: ReplaceClassOptions
): Promise<ReplaceClassResult> {
  const {
    leagueId,
    season,
    recruits,
    vintage,
    storyPlan,
    initStorylines = false,
    asyncStorylines = false,
    storyStartWeek = 1,
    saveState,
    audit,
  } = opts;

  // 1. Safety save state (outside transaction — non-fatal if it fails) ────────
  if (saveState) {
    try {
      await captureLeagueSaveState(
        leagueId,
        saveState.trigger,
        saveState.label,
        saveState.userId ?? undefined
      );
    } catch (err) {
      console.error(
        `[replaceRecruitClass] save-state capture failed for league ${leagueId}:`,
        err
      );
    }
  }

  // 2. Single atomic transaction: delete + insert + storyline recruits + vintage
  // All steps share the same Drizzle transaction so ANY failure rolls back the
  // entire operation.  The league row is locked at the start so concurrent calls
  // cannot interleave their deletes/inserts.
  const CHUNK = 100;
  let insertedCount = 0;

  await db.transaction(async (tx) => {
    // 2a. Advisory lock — lock the league row for the duration of this tx
    await tx.execute(
      `SELECT id FROM leagues WHERE id = '${leagueId.replace(/'/g, "''")}' FOR UPDATE`
    );

    // 2b. Find existing recruit IDs so we can cascade-delete child rows
    const existing = await tx
      .select({ id: recruitsTable.id })
      .from(recruitsTable)
      .where(eq(recruitsTable.leagueId, leagueId));
    const existingIds = existing.map(r => r.id);

    if (existingIds.length > 0) {
      // Delete child rows in dependency order
      await tx.delete(recruitTopSchools).where(inArray(recruitTopSchools.recruitId, existingIds));
      await tx.delete(recruitingActionsLog).where(inArray(recruitingActionsLog.recruitId, existingIds));
      await tx.delete(recruitingInterests).where(inArray(recruitingInterests.recruitId, existingIds));

      const srRows = await tx
        .select({ id: storylineRecruits.id })
        .from(storylineRecruits)
        .where(inArray(storylineRecruits.recruitId, existingIds));
      const srIds = srRows.map(r => r.id);

      if (srIds.length > 0) {
        const evRows = await tx
          .select({ id: storylineEvents.id })
          .from(storylineEvents)
          .where(inArray(storylineEvents.storylineRecruitId, srIds));
        const evIds = evRows.map(e => e.id);

        if (evIds.length > 0) {
          await tx.delete(storylineVotes).where(inArray(storylineVotes.eventId, evIds));
          await tx.delete(storylineEvents).where(inArray(storylineEvents.id, evIds));
        }
        await tx.delete(storylineRecruits).where(inArray(storylineRecruits.id, srIds));
      }

      await tx.delete(recruitsTable).where(eq(recruitsTable.leagueId, leagueId));
    }

    // 2c. Insert the new class in chunks, capturing DB-assigned IDs and
    //     all fields needed for storyline pick computation.
    const insertedRows: Array<{
      id: string;
      overall: number | null;
      starRank: number | null;
      isBlueChip: boolean | null;
      isGenerationalGem: boolean | null;
      firstName: string | null;
      lastName: string | null;
      position: string;
    }> = [];

    for (let i = 0; i < recruits.length; i += CHUNK) {
      const batch = await tx
        .insert(recruitsTable)
        .values(recruits.slice(i, i + CHUNK))
        .returning({
          id: recruitsTable.id,
          overall: recruitsTable.overall,
          starRank: recruitsTable.starRank,
          isBlueChip: recruitsTable.isBlueChip,
          isGenerationalGem: recruitsTable.isGenerationalGem,
          firstName: recruitsTable.firstName,
          lastName: recruitsTable.lastName,
          position: recruitsTable.position,
        });
      insertedCount += batch.length;
      insertedRows.push(...batch);
    }

    // 2d. Storyline recruit creation (sync path only) — inside the transaction
    //     so any failure here rolls back the entire recruit pool replacement.
    //     Uses pickStorylineRecruits (pure computation) and tx.insert (Drizzle).
    //     Arc events are generated post-transaction as best-effort.
    //
    //     IMPORTANT: use `insertedRows` (DB-assigned UUIDs from RETURNING) not
    //     `opts.recruits` — validation strips input IDs so r.id would be undefined.
    if (initStorylines && !asyncStorylines) {
      const recruitsForPicker = insertedRows.map(r => ({
        id: r.id,
        overall: r.overall ?? 250,
        starRank: r.starRank ?? 3,
        isBlueChip: r.isBlueChip ?? false,
        isGenerationalGem: r.isGenerationalGem ?? false,
        firstName: r.firstName ?? "Recruit",
        lastName: r.lastName ?? "",
        position: r.position,
      }));

      // Query recentLegendaryCount from previous seasons (best-effort; doesn't need tx)
      let recentLegendaryCount = 0;
      try {
        for (let s = Math.max(1, season - 4); s < season; s++) {
          const prev = await storage.getStorylineRecruitsByLeague(leagueId, s);
          recentLegendaryCount += prev.filter(sl => sl.isLegendary).length;
        }
      } catch (e) {
        console.warn("[replaceRecruitClass] recentLegendaryCount fetch failed (non-fatal):", e);
      }

      // Wire seeded RNG for storyline selection when a master seed is provided
      // so the same class with the same seed always picks the same storyline recruits.
      let overlapRng: (() => number) | undefined;
      if (opts.masterSeed) {
        const { rngFromString } = await import("../../shared/seededRng");
        _setStorylineRng(rngFromString(opts.masterSeed + "_storyline"));
        overlapRng = rngFromString(opts.masterSeed + "_overlap");
      }
      let picks: ReturnType<typeof pickStorylineRecruits>;
      try {
        picks = pickStorylineRecruits(recruitsForPicker, { recentLegendaryCount });
      } finally {
        if (opts.masterSeed) _resetStorylineRng();
      }

      // Tracks authored-arc recruit DB IDs so we can stamp hiddenVars.authoredArc=true
      // at insert time, which suppresses random archetype transitions during resolution.
      const authoredRecruitIds = new Set<string>();

      // ── Apply authored storyPlan overrides + guarantee cast inclusion ────
      // Match cast members to DB recruits by positional correlation:
      //   opts.recruits[i].templateRecruitId → insertedRows[i].id
      // (Order preserved because batch inserts use RETURNING in insertion order.)
      //
      // Two passes:
      //   Pass 1 — override archetype for cast members already in picks.
      //   Pass 2 — force-include any cast member NOT selected by the picker;
      //            authors expect all 10 cast slots to appear as storyline recruits.
      if (storyPlan?.mode === "authored" && storyPlan.cast.length > 0) {
        const templateIdToDbId = new Map<string, string>();
        for (let i = 0; i < opts.recruits.length; i++) {
          const tId = (opts.recruits[i] as any).templateRecruitId as string | undefined;
          const dbId = insertedRows[i]?.id;
          if (tId && dbId) templateIdToDbId.set(tId, dbId);
        }

        // Build dbId → forced archetype for template-mode cast members
        const forcedArchetype = new Map<string, string>();
        for (const member of storyPlan.cast) {
          if (member.arcMode === "template" && member.arcTemplateKey) {
            const dbId = templateIdToDbId.get(member.templateRecruitId);
            if (dbId) forcedArchetype.set(dbId, member.arcTemplateKey);
          }
        }

        // Pass 1 — apply archetype overrides for picks already selected
        const pickedIds = new Set(picks.map(p => p.recruitId));
        for (const pick of picks) {
          const override = forcedArchetype.get(pick.recruitId);
          if (override) {
            pick.archetype = override as typeof pick.archetype;
            authoredRecruitIds.add(pick.recruitId);
            console.log(`[replaceRecruitClass] storyPlan override: ${pick.recruitId} → ${override}`);
          }
        }

        // Pass 2 — force-include cast members missing from picks, maintaining
        //          a strict 10-slot cap.  Before adding a missing cast member,
        //          evict the last non-cast pick so the total never exceeds 10.
        const MAX_STORY_SLOTS = 10;
        for (const member of storyPlan.cast) {
          if (member.arcMode !== "template" || !member.arcTemplateKey) continue;
          const dbId = templateIdToDbId.get(member.templateRecruitId);
          if (!dbId || pickedIds.has(dbId)) continue; // already included

          const row = insertedRows.find(r => r.id === dbId);
          if (!row) continue;

          // If at the slot cap, evict the last non-cast pick to make room.
          if (picks.length >= MAX_STORY_SLOTS) {
            const evictIdx = picks.reduce<number>((found, p, i) =>
              !authoredRecruitIds.has(p.recruitId) ? i : found, -1);
            if (evictIdx === -1) {
              // All picks are authored cast members — no room to add another cast slot.
              console.warn(`[replaceRecruitClass] storyPlan force-include skipped (cap full): ${dbId}`);
              continue;
            }
            const evicted = picks.splice(evictIdx, 1)[0];
            pickedIds.delete(evicted.recruitId);
            console.log(`[replaceRecruitClass] storyPlan evicted non-cast pick ${evicted.recruitId} to make room`);
          }

          // Synthesise a pick entry so the cast member gets a storyline recruit row.
          picks.push({
            recruitId: dbId,
            archetype: member.arcTemplateKey as import("../storylineEngine").Archetype,
            tier: row.isGenerationalGem ? "legendary" : row.isBlueChip ? "blue_chip" : "standard",
            hiddenVars: { polarity: 0.5 },
            isLegendary: Boolean(row.isGenerationalGem),
            imagePrompt: "",
          } as unknown as (typeof picks)[0]);
          pickedIds.add(dbId);
          authoredRecruitIds.add(dbId);
          console.log(`[replaceRecruitClass] storyPlan force-include: ${dbId} → ${member.arcTemplateKey}`);
        }
      }

      // Insert storyline recruits using tx so failure rolls back the entire class
      const insertedSR = await tx
        .insert(storylineRecruits)
        .values(
          picks.map((pick, i): InsertStorylineRecruit => ({
            leagueId,
            recruitId: pick.recruitId,
            season,
            archetype: pick.archetype,
            tier: pick.tier,
            storySlot: i % 10,
            hiddenVars: {
              ...pick.hiddenVars,
              startWeek: storyStartWeek,
              // Authored-arc flag suppresses random archetype transitions during resolution
              ...(authoredRecruitIds.has(pick.recruitId) ? { authoredArc: true } : {}),
            },
            isLegendary: pick.isLegendary,
            currentArcStage: 0,
            resolvedOvrDelta: 0,
          }))
        )
        .returning({ id: storylineRecruits.id });

      // Update overlapping recruit pairs (link ~15% of adjacent pairs)
      const rand = overlapRng ?? Math.random.bind(Math);
      const shuffled = [...insertedSR].sort(() => rand() - 0.5);
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        if (rand() < 0.15) {
          await tx
            .update(storylineRecruits)
            .set({ overlappingRecruitId: shuffled[i + 1].id })
            .where(eq(storylineRecruits.id, shuffled[i].id));
          await tx
            .update(storylineRecruits)
            .set({ overlappingRecruitId: shuffled[i].id })
            .where(eq(storylineRecruits.id, shuffled[i + 1].id));
        }
      }

      console.log(
        `[replaceRecruitClass] inserted ${picks.length} storyline recruits in-transaction for league ${leagueId} season ${season}`
      );
    }

    // 2e. Update currentClassVintage inside the same transaction
    if (vintage !== undefined) {
      await tx.execute(
        `UPDATE leagues SET "currentClassVintage" = ${vintage === null ? "NULL" : `'${String(vintage).replace(/'/g, "''")}'`} WHERE id = '${leagueId.replace(/'/g, "''")}'`
      );
    }
  });

  // 3. Post-transaction: generate initial arc events (best-effort, sync path) ─
  //    The storyline_recruits rows are now committed.  Arc event generation uses
  //    those rows to pre-populate storyline_events.  Any failure here is logged
  //    but does not corrupt the committed recruit pool.
  if (initStorylines && !asyncStorylines) {
    await generateInitialStorylineEvents(leagueId, season, storyStartWeek);
  }

  // 4. Async path: fire-and-forget full init ────────────────────────────────
  //    Caller opts in; partial state is acceptable in this mode.
  if (initStorylines && asyncStorylines) {
    initializeStorylineRecruits(leagueId, season)
      .then(n =>
        console.log(
          `[replaceRecruitClass] (async) initialized ${n} storyline recruits for league ${leagueId} season ${season}`
        )
      )
      .catch(err =>
        console.error(
          `[replaceRecruitClass] (async) storyline init failed for league ${leagueId}:`,
          err
        )
      );
  }

  // 5. Invalidate league cache ───────────────────────────────────────────────
  invalidateLeague(leagueId);

  // 6. Audit log ─────────────────────────────────────────────────────────────
  if (audit) {
    try {
      await storage.createAuditLog({
        leagueId,
        userId: audit.userId,
        action: audit.action,
        details: audit.details,
      });
    } catch (err) {
      console.error(
        `[replaceRecruitClass] audit log write failed for league ${leagueId}:`,
        err
      );
    }
  }

  return { count: insertedCount };
}
