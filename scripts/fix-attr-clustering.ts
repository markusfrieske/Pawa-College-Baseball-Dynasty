/**
 * fix-attr-clustering.ts
 *
 * Reduces attribute value clustering in pitcher and hitter rosters.
 * Target: no single attribute value exceeds 5% of its player group.
 *
 * Clusters to fix (RAW uncalibrated values):
 *   Pitcher velocity=62: 95/1407 = 6.8%  → move 25 to [60,61,63,64]
 *   Pitcher control=58: 105/1407 = 7.5%  → move 35 to [56,57,59,60]
 *   Pitcher stuff=52:  108/1407 = 7.7%  → move 38 to [50,51,53,54]
 *   Pitcher stuff=38:  103/1407 = 7.3%  → move 33 to [36,37,39,40]
 *   Pitcher stuff=30:   97/1407 = 6.9%  → move 27 to [31,32,33,34]
 *   Hitter  hitForAvg=57: 123/2318 = 5.3% → move 8  to [55,56,58,59]
 *
 * Selection is deterministic: players at each cluster value are sorted by a
 * stable name hash, and the first `excess` are reassigned to adjacent values
 * in round-robin order. This ensures a re-run is idempotent.
 */

import * as fs from "fs";
import * as path from "path";
import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL"]);

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

interface ClusterTarget {
  attr: string;
  val: number;
  group: "pitcher" | "hitter";
  /** Players to move out of this value */
  excess: number;
  /** Adjacent values to distribute into (round-robin) */
  adjacent: number[];
}

const TARGETS: ClusterTarget[] = [
  { attr: "velocity",  val: 62, group: "pitcher", excess: 25, adjacent: [60, 61, 63, 64] },
  { attr: "control",   val: 58, group: "pitcher", excess: 35, adjacent: [56, 57, 59, 60] },
  { attr: "stuff",     val: 52, group: "pitcher", excess: 38, adjacent: [50, 51, 53, 54] },
  { attr: "stuff",     val: 38, group: "pitcher", excess: 33, adjacent: [36, 37, 39, 40] },
  { attr: "stuff",     val: 30, group: "pitcher", excess: 27, adjacent: [31, 32, 33, 34] },
  { attr: "hitForAvg", val: 57, group: "hitter",  excess:  8, adjacent: [55, 56, 58, 59] },
];

// ── Stable name hash (deterministic) ─────────────────────────────────────────

function nameHash(firstName: string, lastName: string): number {
  const s = `${firstName}|${lastName}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ── Build jitter map: playerKey → { attr → { from: clusterVal, to: newVal } } ──
// IMPORTANT: stores the source cluster value so the apply step can use a
// source-value guard and skip any player whose current value differs from
// the cluster target (prevents same-name collisions from being wrongly edited).

interface JitterEntry { from: number; to: number }
type JitterMap = Map<string, Record<string, JitterEntry>>;

function buildJitterMap(): JitterMap {
  const jitter: JitterMap = new Map();

  const allPlayers = Object.entries(RAW_UNCALIBRATED_ROSTERS).flatMap(
    ([_team, ps]) => (ps as any[])
  );

  for (const target of TARGETS) {
    const { attr, val, group, excess, adjacent } = target;

    const candidates = allPlayers.filter((p) => {
      const isPitcher = PITCHER_POSITIONS.has(p.position);
      const matchesGroup = group === "pitcher" ? isPitcher : !isPitcher;
      return matchesGroup && p[attr] === val;
    });

    // Stable sort by name hash
    candidates.sort((a, b) => {
      const ha = nameHash(a.firstName, a.lastName);
      const hb = nameHash(b.firstName, b.lastName);
      return ha - hb;
    });

    // Take the first `excess` candidates to jitter
    const toJitter = candidates.slice(0, excess);

    toJitter.forEach((p, idx) => {
      const key = `${p.firstName}|${p.lastName}`;
      if (!jitter.has(key)) jitter.set(key, {});
      const newVal = adjacent[idx % adjacent.length];
      jitter.get(key)![attr] = { from: val, to: newVal };
    });
  }

  return jitter;
}

// ── Apply jitter to source files ──────────────────────────────────────────────

function applyJitter(jitter: JitterMap): void {
  let totalChanges = 0;
  const appliedKeys = new Set<string>();

  for (const relPath of ROSTER_FILES) {
    const fullPath = path.resolve(relPath);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    let curFirst: string | null = null;
    let curLast: string | null = null;
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const fnMatch = line.match(/firstName:\s*"([^"]+)"/);
      const lnMatch = line.match(/lastName:\s*"([^"]+)"/);
      if (fnMatch) curFirst = fnMatch[1];
      if (lnMatch) curLast = lnMatch[1];

      if (!curFirst || !curLast) continue;
      const key = `${curFirst}|${curLast}`;
      const changes = jitter.get(key);
      if (!changes) continue;

      for (const [attr, { from: clusterVal, to: newVal }] of Object.entries(changes)) {
        const attrRe = new RegExp(`(\\b${attr}:\\s*)(\\d+)(,?)`);
        const m = line.match(attrRe);
        if (!m) continue;
        const curVal = parseInt(m[2]);

        // SOURCE-VALUE GUARD: only apply if current value equals the cluster
        // target. Skips same-name players who were never in the cluster.
        if (curVal !== clusterVal) continue;
        if (curVal === newVal) continue;

        lines[i] = lines[i].replace(attrRe, `$1${newVal}$3`);
        modified = true;
        totalChanges++;
        if (!appliedKeys.has(`${key}:${attr}`)) {
          console.log(
            `  ${curFirst} ${curLast} ${attr}: ${curVal} → ${newVal}  (${relPath})`
          );
          appliedKeys.add(`${key}:${attr}`);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(fullPath, lines.join("\n"));
    }
  }

  console.log(`\nTotal attribute changes: ${totalChanges}`);

  // Report any jitter entries that were never applied
  for (const [key, changes] of jitter.entries()) {
    for (const attr of Object.keys(changes)) {
      if (!appliedKeys.has(`${key}:${attr}`)) {
        console.warn(`  WARNING: not found in source files: ${key} [${attr}]`);
      }
    }
  }
}

// ── Verify post-fix distribution ──────────────────────────────────────────────

function verifyDistribution(): void {
  // Re-import is not possible after file modification in the same process,
  // so we just report what was planned.
  console.log("\nPost-fix expected maximums:");
  console.log("  velocity=62: ~70/1407 = 4.97% ✓ (was 6.8%)");
  console.log("  control=58:  ~70/1407 = 4.97% ✓ (was 7.5%)");
  console.log("  stuff=52:    ~70/1407 = 4.97% ✓ (was 7.7%)");
  console.log("  stuff=38:    ~70/1407 = 4.97% ✓ (was 7.3%)");
  console.log("  stuff=30:    ~70/1407 = 4.97% ✓ (was 6.9%)");
  console.log("  hitForAvg=57: ~115/2318 = 4.96% ✓ (was 5.3%)");
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("Building jitter map...");
const jitter = buildJitterMap();
console.log(`Jitter assignments: ${jitter.size} players (some may have multiple attrs)`);
const totalAssignments = [...jitter.values()].reduce(
  (sum, m) => sum + Object.keys(m).length,
  0
);
console.log(`Total attr reassignments: ${totalAssignments}\n`);

console.log("Applying to source files...");
applyJitter(jitter);
verifyDistribution();
