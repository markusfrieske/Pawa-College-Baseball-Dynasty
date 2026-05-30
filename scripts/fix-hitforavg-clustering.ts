/**
 * fix-hitforavg-clustering.ts
 *
 * Eliminates the hitForAvg clustering warning by jittering excess hitters
 * away from over-represented raw attribute values.
 *
 * Target: no single hitForAvg value exceeds 3.5% of all hitters (≤ 81/2318).
 *
 * Cluster targets (RAW uncalibrated, post Task #697):
 *   val=57: 115 (4.96%) excess=34 → [65,66,67,68]
 *   val=56:  99 (4.27%) excess=18 → [58,60,64,65]
 *   val=62:  99 (4.27%) excess=18 → [66,67,68,69]
 *   val=55:  96 (4.14%) excess=15 → [53,54,58,60]
 *   val=61:  94 (4.06%) excess=13 → [64,65,66,67]
 *   val=59:  93 (4.01%) excess=12 → [58,60,64,65]
 *   val=52:  93 (4.01%) excess=12 → [50,51,53,54]
 *   val=48:  87 (3.75%) excess= 6 → [44,46,47]
 *   val=45:  84 (3.62%) excess= 3 → [43,44,46]
 *   val=63:  83 (3.58%) excess= 2 → [66,67]
 *
 * Target capacity after additions (all below 81 → below 3.5%):
 *   43→20, 44→62, 46→60, 47→50, 50→65, 51→79, 53→78, 54→78,
 *   58→80, 60→68, 64→70, 65→45, 66→43, 67→49, 68→22, 69→14
 *
 * SOURCE-VALUE GUARD: only changes hitForAvg when the current value in the
 * source file exactly equals the cluster target. This prevents same-name
 * position-player collisions from being wrongly edited.
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
  val: number;
  excess: number;
  adjacent: number[];
}

const TARGETS: ClusterTarget[] = [
  { val: 57, excess: 34, adjacent: [65, 66, 67, 68] },
  { val: 56, excess: 18, adjacent: [58, 60, 64, 65] },
  { val: 62, excess: 18, adjacent: [66, 67, 68, 69] },
  { val: 55, excess: 15, adjacent: [53, 54, 58, 60] },
  { val: 61, excess: 13, adjacent: [64, 65, 66, 67] },
  { val: 59, excess: 12, adjacent: [58, 60, 64, 65] },
  { val: 52, excess: 12, adjacent: [50, 51, 53, 54] },
  { val: 48, excess:  6, adjacent: [44, 46, 47] },
  { val: 45, excess:  3, adjacent: [43, 44, 46] },
  { val: 63, excess:  2, adjacent: [66, 67] },
];

function nameHash(firstName: string, lastName: string): number {
  const s = `${firstName}|${lastName}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

interface JitterEntry { from: number; to: number }
type JitterMap = Map<string, { hitForAvg: JitterEntry }>;

function buildJitterMap(): JitterMap {
  const jitter: JitterMap = new Map();

  const allPlayers = Object.entries(RAW_UNCALIBRATED_ROSTERS).flatMap(
    ([_team, ps]) => (ps as any[])
  );
  const hitters = allPlayers.filter(
    (p) => !PITCHER_POSITIONS.has(p.position)
  );

  for (const { val, excess, adjacent } of TARGETS) {
    const candidates = hitters.filter((p) => p.hitForAvg === val);

    candidates.sort((a, b) => {
      return nameHash(a.firstName, a.lastName) - nameHash(b.firstName, b.lastName);
    });

    const toJitter = candidates.slice(0, excess);

    toJitter.forEach((p, idx) => {
      const key = `${p.firstName}|${p.lastName}`;
      const newVal = adjacent[idx % adjacent.length];
      jitter.set(key, { hitForAvg: { from: val, to: newVal } });
    });
  }

  return jitter;
}

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

      const { from: clusterVal, to: newVal } = changes.hitForAvg;

      const attrRe = /(\bhitForAvg:\s*)(\d+)(,?)/;
      const m = line.match(attrRe);
      if (!m) continue;
      const curVal = parseInt(m[2]);

      if (curVal !== clusterVal) continue;
      if (curVal === newVal) continue;

      lines[i] = lines[i].replace(attrRe, `$1${newVal}$3`);
      modified = true;
      totalChanges++;

      if (!appliedKeys.has(key)) {
        console.log(
          `  ${curFirst} ${curLast} hitForAvg: ${curVal} → ${newVal}  (${relPath})`
        );
        appliedKeys.add(key);
      }
    }

    if (modified) {
      fs.writeFileSync(fullPath, lines.join("\n"));
    }
  }

  console.log(`\nTotal hitForAvg changes: ${totalChanges}`);

  for (const [key] of jitter.entries()) {
    if (!appliedKeys.has(key)) {
      console.warn(`  WARNING: player not found in source files: ${key}`);
    }
  }
}

function verifyDistribution(): void {
  const { RAW_UNCALIBRATED_ROSTERS: raw } = require("../server/realRosters");
  const allPlayers = Object.values(raw).flat() as any[];
  const hitters = allPlayers.filter(
    (p: any) => !PITCHER_POSITIONS.has(p.position)
  );
  const counts = new Map<number, number>();
  for (const h of hitters) {
    counts.set(h.hitForAvg, (counts.get(h.hitForAvg) || 0) + 1);
  }
  const threshold = 0.035 * hitters.length;
  const violations = [...counts.entries()]
    .filter(([, c]) => c > threshold)
    .sort((a, b) => b[1] - a[1]);

  if (violations.length === 0) {
    console.log("\n✅ No hitForAvg value exceeds 3.5% of hitters — warning cleared!");
  } else {
    console.log("\n⚠  Still above 3.5% threshold:");
    for (const [v, c] of violations) {
      console.log(`  val=${v}: ${c} (${((c / hitters.length) * 100).toFixed(2)}%)`);
    }
  }
}

console.log("Building hitForAvg jitter map...");
const jitter = buildJitterMap();
console.log(`Jitter assignments: ${jitter.size} hitter players\n`);

console.log("Applying to source files...");
applyJitter(jitter);
verifyDistribution();
