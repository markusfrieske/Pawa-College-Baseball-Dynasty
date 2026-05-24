/**
 * redistribute-pitcher-velocity.ts
 *
 * For every pitcher with velocity < 70 across all 19 real-roster files,
 * redistribute values using a percentile-rank approach within each conference tier:
 *   - Sort pitchers in the file by (velocity ASC, arm ASC)
 *   - Assign target values sampled from N(tierMean, SD=10) clamped [30, 69]
 *   - Preserve relative rank ordering (lowest gets lowest new value)
 *   - Pitchers with velocity >= 70 are untouched
 *
 * Tier means (raw, before routes.ts remap 55+(v-47)*1.2):
 *   Tier 1 (SEC/ACC/Big Ten/Big 12):  mean=50  → dynasty mean ≈ 58.6
 *   Tier 2 (Pac-12/AAC/Sun Belt/MWC): mean=47  → dynasty mean ≈ 55.0
 *   Tier 3 (WCC/Big West/MoValley):   mean=44  → dynasty mean ≈ 51.4
 *   Tier 4 (Ivy League):               mean=41  → dynasty mean ≈ 47.8
 *   Tier 5 (HBCU):                     mean=38  → dynasty mean ≈ 44.2
 */

import * as fs from "fs";
import * as path from "path";

// ── Inverse Normal CDF (rational approximation) ───────────────────────────────
function invNorm(p: number): number {
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
              -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [ 7.784695709041462e-3,  3.224671290700398e-1,  2.445134137142996,
               3.754408661907416];
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
              1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
              6.680131188771972e1, -1.328068155288572e1];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
         ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  return x;
}

function quantileVelocity(rank: number, n: number, mean: number, sd: number): number {
  const q = (rank + 0.5) / n;
  return Math.max(30, Math.min(69, Math.round(mean + invNorm(q) * sd)));
}

// ── File → tier configuration ─────────────────────────────────────────────────
const FILES: { file: string; tier: number }[] = [
  { file: "server/secBatch1.ts",         tier: 1 },
  { file: "server/secBatch2.ts",         tier: 1 },
  { file: "server/secBatch3.ts",         tier: 1 },
  { file: "server/accRostersBatch1.ts",  tier: 1 },
  { file: "server/accRostersBatch2.ts",  tier: 1 },
  { file: "server/accRostersBatch3.ts",  tier: 1 },
  { file: "server/bigTenBatch1.ts",      tier: 1 },
  { file: "server/bigTenBatch2.ts",      tier: 1 },
  { file: "server/bigTenBatch3.ts",      tier: 1 },
  { file: "server/big12Rosters.ts",      tier: 1 },
  { file: "server/pac12Rosters.ts",      tier: 2 },
  { file: "server/mwcRosters.ts",        tier: 2 },
  { file: "server/aacRosters.ts",        tier: 2 },
  { file: "server/sunBeltRosters.ts",    tier: 2 },
  { file: "server/wccRosters.ts",        tier: 3 },
  { file: "server/bigWestRosters.ts",    tier: 3 },
  { file: "server/moValleyRosters.ts",   tier: 3 },
  { file: "server/ivyLeagueRosters.ts",  tier: 4 },
  { file: "server/hbcuRosters.ts",       tier: 5 },
];

const TIER_MEANS: Record<number, number> = { 1: 50, 2: 47, 3: 44, 4: 41, 5: 38 };
const SD = 10;

// ── Per-file replacement logic ────────────────────────────────────────────────
interface PitcherEntry {
  firstName: string;
  lastName: string;
  oldVelocity: number;
  arm: number;
  lineIndex: number;   // line index of the velocity value
  velColStart: number; // character index in that line where the digits start
  velColEnd: number;   // character index just after the digits
}

function processFile(filePath: string, tier: number): void {
  const full = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(full, "utf8");
  const lines = content.split("\n");

  const pitchers: PitcherEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect the first line of a player block: has firstName and position "P"
    const firstNameMatch = line.match(/firstName:\s*"([^"]+)"/);
    const lastNameMatch  = line.match(/lastName:\s*"([^"]+)"/);
    const isPitcher = /position:\s*"P"/.test(line);
    if (!firstNameMatch || !lastNameMatch || !isPitcher) continue;

    const firstName = firstNameMatch[1];
    const lastName  = lastNameMatch[1];

    // Look in lines i+1 .. i+4 for the velocity value
    for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
      const velMatch = lines[j].match(/velocity:\s*(\d+)/);
      if (!velMatch) continue;

      const oldVelocity = parseInt(velMatch[1], 10);
      if (oldVelocity <= 0 || oldVelocity >= 70) break; // skip 0 (non-pitcher) or protected

      // Find arm value on the same stats line
      const armMatch = lines[j].match(/arm:\s*(\d+)/);
      const arm = armMatch ? parseInt(armMatch[1], 10) : 0;

      // Record position of the digits in the line
      const velStart = lines[j].indexOf("velocity: ") + "velocity: ".length;
      const velEnd   = velStart + velMatch[1].length;

      pitchers.push({ firstName, lastName, oldVelocity, arm, lineIndex: j, velColStart: velStart, velColEnd: velEnd });
      break;
    }
  }

  if (pitchers.length === 0) return;

  // Sort ascending by velocity, then arm (preserves relative skill ordering)
  pitchers.sort((a, b) => a.oldVelocity !== b.oldVelocity
    ? a.oldVelocity - b.oldVelocity
    : a.arm - b.arm);

  const mean = TIER_MEANS[tier];
  const newValues = pitchers.map((_, idx) => quantileVelocity(idx, pitchers.length, mean, SD));

  // Apply replacements (work on a mutable copy of lines)
  const newLines = [...lines];
  for (let k = 0; k < pitchers.length; k++) {
    const { lineIndex, velColStart, velColEnd, oldVelocity, firstName, lastName } = pitchers[k];
    const nv = newValues[k];
    if (nv === oldVelocity) continue;
    const line = newLines[lineIndex];
    newLines[lineIndex] = line.slice(0, velColStart) + nv + line.slice(velColEnd);
  }

  fs.writeFileSync(full, newLines.join("\n"), "utf8");

  const changed = pitchers.filter((p, k) => newValues[k] !== p.oldVelocity).length;
  const stacked40 = pitchers.filter(p => p.oldVelocity === 40).length;
  console.log(`[${filePath}] tier=${tier} mean=${mean} | ${pitchers.length} pitchers redistributed (${changed} changed, ${stacked40} were at default 40)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
let totalPitchers = 0;
let totalChanged  = 0;

for (const { file, tier } of FILES) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.warn(`  SKIP (not found): ${file}`);
    continue;
  }
  processFile(file, tier);
}

console.log("\nDone. Run validate-all to confirm no regressions.");
