/**
 * replaceLeagueRecruitingClass
 *
 * Single authoritative helper for replacing a league's entire recruit pool.
 * The core delete + insert is wrapped in a single DB transaction so that any
 * crash between the two steps rolls back rather than leaving zero recruits.
 *
 * Responsibilities (in order):
 *  1. Capture a safety save state (optional).
 *  2. BEGIN TRANSACTION: delete existing recruits and all child data, then
 *     batch-insert the validated recruits. COMMIT or ROLLBACK atomically.
 *  3. Initialize storyline recruits for the new class (optional; sync or async).
 *  4. Update currentClassVintage on the league row (optional).
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
import type { InsertRecruit } from "@shared/schema";
import { captureLeagueSaveState, type SaveStateTrigger } from "./leagueSaveState";
import { initializeStorylineRecruits } from "../storyline-routes";
import { invalidateLeague } from "../cache";

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
   * When true, call initializeStorylineRecruits after inserting recruits.
   * Default: false (preserves prior behaviour for callers that never did it).
   */
  initStorylines?: boolean;

  /**
   * When true, the storyline-init call fires as a background promise (no await).
   * Only meaningful when initStorylines is also true.  Default: false.
   */
  asyncStorylines?: boolean;

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
    initStorylines = false,
    asyncStorylines = false,
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

  // 2. Atomic delete + insert inside a single DB transaction ─────────────────
  // If either step throws, the transaction rolls back and no data is mutated.
  const CHUNK = 100;
  let insertedCount = 0;

  await db.transaction(async (tx) => {
    // 2a. Find existing recruit IDs so we can cascade-delete child rows
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

    // 2b. Insert the new class in chunks
    for (let i = 0; i < recruits.length; i += CHUNK) {
      const inserted = await tx
        .insert(recruitsTable)
        .values(recruits.slice(i, i + CHUNK))
        .returning({ id: recruitsTable.id });
      insertedCount += inserted.length;
    }
  });

  // 3. Storyline initialization (outside transaction — async-safe) ───────────
  if (initStorylines) {
    const initPromise = initializeStorylineRecruits(leagueId, season)
      .then(n =>
        console.log(
          `[replaceRecruitClass] initialized ${n} storyline recruits for league ${leagueId} season ${season}`
        )
      )
      .catch(err =>
        console.error(
          `[replaceRecruitClass] storyline init failed for league ${leagueId}:`,
          err
        )
      );
    if (!asyncStorylines) {
      await initPromise;
    }
  }

  // 4. Update currentClassVintage ────────────────────────────────────────────
  if (vintage !== undefined) {
    await storage.updateLeague(leagueId, { currentClassVintage: vintage });
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
