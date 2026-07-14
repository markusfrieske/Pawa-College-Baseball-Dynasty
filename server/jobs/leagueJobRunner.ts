/**
 * League job runner — polls league_jobs for pending bootstrap jobs and
 * processes them sequentially (bounded concurrency = 1 to avoid DB overload).
 *
 * Starts automatically on server boot. Crashed "running" jobs are reset to
 * "pending" so they can be retried by the next polling cycle.
 */

import { storage } from "../storage";
import { runFullSeasonBootstrap } from "../services/fullSeasonBootstrap";

const POLL_INTERVAL_MS = 5_000;
let isProcessing = false;

async function processNextJob(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  let jobId: string | null = null;
  try {
    // Atomic claim: UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)
    // so concurrent runners can never double-claim the same job.
    const pending = await storage.claimNextPendingJob();
    if (!pending) return;

    jobId = pending.id;
    console.log(`[job-runner] Starting job ${jobId} (type=${pending.jobType}, league=${pending.leagueId})`);

    if (pending.jobType === "bootstrap") {
      await runFullSeasonBootstrap(pending.leagueId, jobId);
    } else {
      throw new Error(`Unknown job type: ${pending.jobType}`);
    }

    await storage.updateLeagueJob(jobId, { status: "complete", progress: 100 });
    console.log(`[job-runner] Job ${jobId} completed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[job-runner] Job ${jobId ?? "?"} failed:`, msg);
    if (jobId) {
      await storage.updateLeagueJob(jobId, {
        status: "failed",
        errorMessage: msg,
      }).catch(e => console.error("[job-runner] Failed to mark job as failed:", e));
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Reset only pre-lease "running" jobs at startup.
 *
 * Jobs that have a valid lease are left alone — claimNextPendingJob() will
 * reclaim them automatically once their lease_expires_at passes.  Only jobs
 * with a NULL lease_expires_at (created before the lease feature) are reset
 * to "pending" here so they can be retried.
 */
async function resetOrphanedJobs(): Promise<void> {
  try {
    const orphans = await storage.getOrphanedLeagueJobs();
    for (const job of orphans) {
      console.warn(`[job-runner] Resetting pre-lease orphaned job ${job.id} to pending`);
      await storage.updateLeagueJob(job.id, { status: "pending", progress: 0 });
    }
    if (orphans.length === 0) {
      console.log("[job-runner] No pre-lease orphaned jobs found at startup");
    }
  } catch (e) {
    console.error("[job-runner] Failed to reset orphaned jobs:", e);
  }
}

/** Start the polling loop. Call once at server startup. */
export function startJobRunner(): void {
  resetOrphanedJobs().then(() => {
    setInterval(processNextJob, POLL_INTERVAL_MS);
    console.log("[job-runner] Started — polling every", POLL_INTERVAL_MS / 1000, "s");
  });
}
