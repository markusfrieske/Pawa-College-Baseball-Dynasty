/**
 * replaceLeagueRecruitingClass
 *
 * Single authoritative helper for replacing a league's entire recruit pool.
 * All paths that swap out recruiting classes (wizard save, load saved class,
 * load-recruiting-class, dynasty start, season-advance saved-class) call this
 * function instead of duplicating the delete/insert/audit/cache-invalidation
 * sequence themselves.
 *
 * Responsibilities (in order):
 *  1. Capture a safety save state (optional).
 *  2. Delete existing recruits and all child data (actions log, interests,
 *     top-schools, storyline recruits/events/votes) via storage.deleteRecruitsByLeague.
 *  3. Batch-insert the validated recruits.
 *  4. Initialize storyline recruits for the new class (optional; sync or async).
 *  5. Update currentClassVintage on the league row (optional).
 *  6. Invalidate the league cache entry (always).
 *  7. Write an audit-log entry (optional).
 */

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

  // 1. Safety save state ─────────────────────────────────────────────────────
  if (saveState) {
    try {
      await captureLeagueSaveState(
        leagueId,
        saveState.trigger,
        saveState.label,
        saveState.userId ?? undefined
      );
    } catch (err) {
      // Non-fatal: log and continue.  A failed save state should not block
      // a commissioner from loading a class.
      console.error(
        `[replaceRecruitClass] save-state capture failed for league ${leagueId}:`,
        err
      );
    }
  }

  // 2. Delete existing recruits and all child data ───────────────────────────
  await storage.deleteRecruitsByLeague(leagueId);

  // 3. Insert the new class ──────────────────────────────────────────────────
  const created = await storage.batchCreateRecruits(recruits);

  // 4. Storyline initialization ──────────────────────────────────────────────
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

  // 5. Update currentClassVintage ────────────────────────────────────────────
  if (vintage !== undefined) {
    await storage.updateLeague(leagueId, { currentClassVintage: vintage });
  }

  // 6. Invalidate league cache ───────────────────────────────────────────────
  invalidateLeague(leagueId);

  // 7. Audit log ─────────────────────────────────────────────────────────────
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

  return { count: created.length };
}
