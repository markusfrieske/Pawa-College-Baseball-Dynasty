/**
 * fix-attr-clustering.ts
 *
 * Reduces attribute value clustering in pitcher and hitter rosters.
 * Target: no single attribute value exceeds 5% of its player group.
 *
 * Clusters to fix (RAW uncalibrated values):
 *   Pitcher velocity=62: 95/1407 = 6.8%  → scatter to [60,61,63,64]
 *   Pitcher control=58: 105/1407 = 7.5%  → scatter to [56,57,59,60]
 *   Pitcher stuff=52:  108/1407 = 7.7%  → scatter to [50,51,53,54]
 *   Pitcher stuff=38:  103/1407 = 7.3%  → scatter to [36,37,39,40]
 *   Pitcher stuff=30:   97/1407 = 6.9%  → scatter to [31,32,33,34]
 *   Hitter  hitForAvg=57: 123/2318 = 5.3% → scatter to [55,56,58,59]
 *
 * Idempotency guarantee
 * ─────────────────────
 * The number of players to move is computed dynamically each run against the
 * CURRENT roster state (imported via RAW_UNCALIBRATED_ROSTERS). If a cluster
 * value is already below the 5% ceiling, the target is skipped entirely and
 * zero changes are made. Once the rosters are fixed, every subsequent re-run
 * produces EXACTLY ZERO changes.
 *
 * Selection is deterministic: players at each cluster value are sorted by a
 * stable name+team hash; the first `excess` (= currentCount - floor(5%)) are
 * reassigned to adjacent values in round-robin order.
 *
 * Same-name collision safety
 * ──────────────────────────
 * The jitter map is keyed by "firstName|lastName|team" (not name alone), so
 * two players with the same name on different teams are always independent
 * entries and never confused. The source-file scanner uses updatePlayerContext()
 * from roster-scan-helper to track the current team from array-declaration
 * lines (e.g. `"LSU": [`).
 */

import * as fs from "fs";
import * as path from "path";
import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import {
  createPlayerContext,
  updatePlayerContext,
  nameTeamKey,
  PITCHER_POSITIONS,
} from "./roster-scan-helper";

const ROSTER_FILES = [
  "server/secBatch1.ts",
  "server/secBatch2.ts",
  "server/secBatch3.ts",
  "server/accRostersBatch1.ts",
  "server/accRostersBatch2.ts",
  "server/accRostersBatch3.ts",
  "server/bigTenBatch1.ts",
  "server/bigTenBatch2.ts",
  "server/bigTenBatch3.ts",
  "server/big12Rosters.ts",
  "server/pac12Rosters.ts",
  "server/mwcRosters.ts",
  "server/aacRosters.ts",
  "server/sunBeltRosters.ts",
  "server/wccRosters.ts",
  "server/bigWestRosters.ts",
  "server/moValleyRosters.ts",
  "server/ivyLeagueRosters.ts",
  "server/hbcuRosters.ts",
];

/** Maximum allowed fraction of a position group at a single attribute value. */
const CLUSTER_CEILING = 0.05;

interface ClusterTarget {
  attr: string;
  val: number;
  group: "pitcher" | "hitter";
  /** Adjacent values to distribute excess players into (round-robin). */
  adjacent: number[];
}

const TARGETS: ClusterTarget[] = [
  { attr: "velocity",  val: 62, group: "pitcher", adjacent: [60, 61, 63, 64] },
  { attr: "control",   val: 58, group: "pitcher", adjacent: [56, 57, 59, 60] },
  { attr: "stuff",     val: 52, group: "pitcher", adjacent: [50, 51, 53, 54] },
  { attr: "stuff",     val: 38, group: "pitcher", adjacent: [36, 37, 39, 40] },
  { attr: "stuff",     val: 30, group: "pitcher", adjacent: [31, 32, 33, 34] },
  { attr: "hitForAvg", val: 57, group: "hitter",  adjacent: [55, 56, 58, 59] },
];

// ── Stable name+team hash (deterministic) ────────────────────────────────────

function nameTeamHash(firstName: string, lastName: string, team: string): number {
  const s = `${firstName}|${lastName}|${team}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ── Build jitter map ──────────────────────────────────────────────────────────
//
// Key: "firstName|lastName|team" (never name-only) so same-named players on
// different teams get independent entries.
//
// Value: { attr → { from: clusterVal, to: newVal } }
//   `from` is stored so the apply step can use a source-value guard: if the
//   file's current value no longer equals `from`, the player was already moved
//   in a previous run and must be skipped. This is the inner idempotency guard.
//
// Outer idempotency: excess is computed dynamically from the current
// distribution. When currentCount ≤ floor(CLUSTER_CEILING × groupSize), excess
// is 0 and the target is silently skipped — no entries are created.

interface JitterEntry { from: number; to: number }
type JitterMap = Map<string, Record<string, JitterEntry>>;

function buildJitterMap(): JitterMap {
  const jitter: JitterMap = new Map();

  // Flatten all players, preserving team context.
  const allPlayers: Array<{ firstName: string; lastName: string; team: string; position: string } & Record<string, unknown>> = [];
  for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
    for (const p of players as any[]) {
      allPlayers.push({ ...p, team });
    }
  }

  // Count group sizes once (pitcher / hitter).
  const pitcherCount = allPlayers.filter(p => PITCHER_POSITIONS.has(p.position)).length;
  const hitterCount  = allPlayers.filter(p => !PITCHER_POSITIONS.has(p.position)).length;

  for (const target of TARGETS) {
    const { attr, val, group, adjacent } = target;

    const groupSize  = group === "pitcher" ? pitcherCount : hitterCount;
    const threshold  = Math.floor(CLUSTER_CEILING * groupSize); // max allowed count

    const candidates = allPlayers.filter(p => {
      const isPitcher = PITCHER_POSITIONS.has(p.position);
      const matchesGroup = group === "pitcher" ? isPitcher : !isPitcher;
      return matchesGroup && (p as any)[attr] === val;
    });

    const currentCount = candidates.length;
    const excess       = Math.max(0, currentCount - threshold);

    const pct = ((currentCount / groupSize) * 100).toFixed(1);
    if (excess === 0) {
      console.log(
        `  [skip] ${group} ${attr}=${val}: ${currentCount}/${groupSize} = ${pct}% ` +
        `(already ≤ ${(CLUSTER_CEILING * 100).toFixed(0)}%)`
      );
      continue;
    }

    console.log(
      `  [fix]  ${group} ${attr}=${val}: ${currentCount}/${groupSize} = ${pct}% ` +
      `→ moving ${excess} player(s)`
    );

    // Stable sort by (name+team) hash — deterministic across re-runs on same data.
    candidates.sort((a, b) => {
      const ha = nameTeamHash(a.firstName, a.lastName, a.team);
      const hb = nameTeamHash(b.firstName, b.lastName, b.team);
      return ha - hb;
    });

    const toJitter = candidates.slice(0, excess);

    toJitter.forEach((p, idx) => {
      const key    = `${p.firstName}|${p.lastName}|${p.team}`;
      const newVal = adjacent[idx % adjacent.length];
      if (!jitter.has(key)) jitter.set(key, {});
      jitter.get(key)![attr] = { from: val, to: newVal };
    });
  }

  return jitter;
}

// ── Apply jitter to source files ──────────────────────────────────────────────
//
// Uses updatePlayerContext() to track (firstName, lastName, position, team)
// from each file line. Jitter lookup uses the full team-qualified key so
// same-named players on different teams are matched independently.
//
// Source-value guard: only apply if the file's current attr value equals the
// cluster target stored in `from`. Players already moved in a previous run
// will have a different value and are automatically skipped.

function applyJitter(jitter: JitterMap): void {
  let totalChanges = 0;
  const appliedKeys = new Set<string>();

  for (const relPath of ROSTER_FILES) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    const ctx   = createPlayerContext();
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      updatePlayerContext(line, ctx);

      if (!ctx.firstName || !ctx.lastName || !ctx.team) continue;
      const key     = nameTeamKey(ctx);
      const changes = jitter.get(key);
      if (!changes) continue;

      for (const [attr, { from: clusterVal, to: newVal }] of Object.entries(changes)) {
        const attrRe = new RegExp(`(\\b${attr}:\\s*)(\\d+)(,?)`);
        const m      = line.match(attrRe);
        if (!m) continue;
        const curVal = parseInt(m[2]);

        // Source-value guard: skip if value was already changed in a prior run.
        if (curVal !== clusterVal) continue;
        if (curVal === newVal) continue;

        lines[i]  = lines[i].replace(attrRe, `$1${newVal}$3`);
        modified  = true;
        totalChanges++;
        const displayKey = `${ctx.firstName} ${ctx.lastName} [${ctx.team}]`;
        if (!appliedKeys.has(`${key}:${attr}`)) {
          console.log(`  ${displayKey} ${attr}: ${curVal} → ${newVal}  (${relPath})`);
          appliedKeys.add(`${key}:${attr}`);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(fullPath, lines.join("\n"));
    }
  }

  console.log(`\nTotal attribute changes: ${totalChanges}`);

  // Report any jitter entries that were planned but not applied in any file.
  for (const [key, changes] of jitter.entries()) {
    for (const attr of Object.keys(changes)) {
      if (!appliedKeys.has(`${key}:${attr}`)) {
        console.warn(`  WARNING: not found in source files: ${key} [${attr}]`);
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("Checking current cluster distribution (keyed by firstName|lastName|team)...");
const jitter = buildJitterMap();

const totalAssignments = [...jitter.values()].reduce(
  (sum, m) => sum + Object.keys(m).length,
  0
);

if (totalAssignments === 0) {
  console.log("\nAll clusters already below 5% ceiling — nothing to do. ✓");
  process.exit(0);
}

console.log(`\nJitter entries: ${jitter.size} player-team pairs, ${totalAssignments} total attr reassignments\n`);
console.log("Applying to source files...");
applyJitter(jitter);
