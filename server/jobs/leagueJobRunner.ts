/**
 * League job runner — polls league_jobs for pending bootstrap jobs and
 * processes them sequentially (bounded concurrency = 1 to avoid DB overload).
 *
 * Lease ownership model (MP-014):
 *  - Each server process generates a unique RUNNER_INSTANCE_ID at startup.
 *  - claimNextPendingJob() sets locked_by = RUNNER_INSTANCE_ID so two concurrent
 *    instances cannot claim the same job.
 *  - A heartbeat renews the lease every 30 s so a slow bootstrap cannot be
 *    incorrectly reclaimed by a second instance while work is still in progress.
 *  - If the heartbeat detects that ownership was lost (another instance reclaimed
 *    the expired lease), the AbortController is signalled and bootstrap work
 *    stops at the next checkpoint boundary.
 *  - completeLeagueJob() / failLeagueJob() check locked_by before writing so a
 *    slow instance that lost its lease cannot overwrite a new owner's status.
 *  - On startup: resetExpiredJobs() sets status = 'pending' for any 'running'
 *    job whose lease has already expired (orphaned by a prior crash), so the next
 *    poll cycle picks them up fresh.
 */

import { randomUUID } from "crypto";
import { storage } from "../storage";
import { runFullSeasonBootstrap } from "../services/fullSeasonBootstrap";

export const RUNNER_INSTANCE_ID = randomUUID();

const POLL_INTERVAL_MS    = 5_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
let isProcessing = false;

async function processNextJob(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  let jobId: string | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const abort = new AbortController();

  try {
    // Atomic claim: UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)
    // locked_by is set to this instance's UUID so ownership can be verified on
    // complete/fail and concurrent instances never double-claim.
    const pending = await storage.claimNextPendingJob(RUNNER_INSTANCE_ID);
    if (!pending) return;

    jobId = pending.id;
    console.log(
      `[job-runner] Starting job ${jobId} (type=${pending.jobType}, league=${pending.leagueId}) ` +
      `instance=${RUNNER_INSTANCE_ID.slice(0, 8)}`
    );

    // ── Lease heartbeat ─────────────────────────────────────────────────────
    // Renew the lease every 30 s.  If renewal returns false the lease was lost
    // to another instance (expired + reclaimed); signal abort so the bootstrap
    // stops at the next checkpoint boundary rather than continuing indefinitely.
    heartbeat = setInterval(async () => {
      if (!jobId || abort.signal.aborted) return;
      try {
        const renewed = await storage.renewLeagueJobLease(jobId, RUNNER_INSTANCE_ID);
        if (!renewed) {
          console.warn(
            `[job-runner] Lease lost for job ${jobId} — another instance reclaimed it. Aborting.`
          );
          abort.abort(new Error("lease_lost"));
        }
      } catch (e) {
        console.error("[job-runner] Heartbeat renewal error:", e);
      }
    }, HEARTBEAT_INTERVAL_MS);

    if (pending.jobType === "bootstrap") {
      await runFullSeasonBootstrap(pending.leagueId, jobId, abort.signal);
    } else {
      throw new Error(`Unknown job type: ${pending.jobType}`);
    }

    // Ownership check: only mark complete if we still own the lease.
    const completed = await storage.completeLeagueJob(jobId, RUNNER_INSTANCE_ID, {
      status: "complete",
      progress: 100,
    });
    if (!completed) {
      console.warn(
        `[job-runner] Job ${jobId} finished but lease was already taken by another instance — skipping status update`
      );
    } else {
      console.log(`[job-runner] Job ${jobId} completed`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the abort reason is lease_lost, the new owner will handle status.
    if (abort.signal.aborted && msg === "lease_lost") {
      console.warn(`[job-runner] Job ${jobId ?? "?"} stopped: lease was reclaimed by another instance`);
    } else {
      console.error(`[job-runner] Job ${jobId ?? "?"} failed:`, msg);
      if (jobId) {
        await storage.completeLeagueJob(jobId, RUNNER_INSTANCE_ID, {
          status: "failed",
          errorMessage: msg,
        }).catch(e => console.error("[job-runner] Failed to mark job as failed:", e));
      }
    }
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    if (!abort.signal.aborted) abort.abort(); // ensure clean teardown
    isProcessing = false;
  }
}

/**
 * Resets running jobs on startup:
 *  - Jobs with NO lease (created before the lease feature) → reset to 'pending'.
 *  - Jobs with an EXPIRED lease → reset to 'pending' (orphaned by a crashed instance).
 *  - Jobs with an ACTIVE lease are left alone (another live instance owns them).
 */
async function resetExpiredJobs(): Promise<void> {
  try {
    const orphans = await storage.getOrphanedLeagueJobs();
    for (const job of orphans) {
      console.warn(
        `[job-runner] Resetting orphaned/expired job ${job.id} to pending ` +
        `(was: ${job.status}, lease: ${job.leaseExpiresAt ?? "none"})`
      );
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
  resetExpiredJobs().then(() => {
    setInterval(processNextJob, POLL_INTERVAL_MS);
    console.log("[job-runner] Started — polling every", POLL_INTERVAL_MS / 1000, "s");
  });
}
