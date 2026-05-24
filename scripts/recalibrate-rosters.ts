/**
 * Recalibrate all roster player attributes so each team's avg OVR aligns with
 * its real 2026 D1Baseball RPI-derived national rank.
 *
 * Formula: targetOVR = 385 - (rank - 1) * (125 / 141)
 *   rank #1  → ~385 OVR
 *   rank #142 → ~260 OVR
 *
 * Outputs: server/rosterScaleFactors.ts (map of teamName → scaleFactor)
 *          and a summary table showing before/after OVR vs target.
 */

import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";
import type { RealPlayer } from "../server/realRosters";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Top-71 national rank list (real 2026 D1Baseball RPI, compressed to in-game teams) ───────────
// Teams in the real RPI top-100 that exist in the game, in RPI order (slots held by non-game teams skipped)
const TOP_71_ORDER: string[] = [
  /* 1 */  "UCLA",
  /* 2 */  "Georgia Tech",
  /* 3 */  "Auburn",
  /* 4 */  "North Carolina",
  /* 5 */  "Texas",
  /* 6 */  "Alabama",
  /* 7 */  "Florida State",
  /* 8 */  "Nebraska",
  /* 9 */  "Georgia",
  /* 10 */ "USC",
  /* 11 */ "Florida",
  /* 12 */ "Southern Miss",
  /* 13 */ "Mississippi State",
  /* 14 */ "Texas A&M",
  /* 15 */ "West Virginia",
  /* 16 */ "Oregon",
  /* 17 */ "Oregon State",
  /* 18 */ "Ole Miss",
  /* 19 */ "Kansas",
  /* 20 */ "Wake Forest",
  /* 21 */ "Arkansas",
  /* 22 */ "Missouri State",
  /* 23 */ "Cincinnati",
  /* 24 */ "Oklahoma",
  /* 25 */ "Virginia",
  /* 26 */ "Coastal Carolina",
  /* 27 */ "Miami",
  /* 28 */ "Oklahoma State",
  /* 29 */ "Tennessee",
  /* 30 */ "Louisiana",
  /* 31 */ "UCF",
  /* 32 */ "Boston College",
  /* 33 */ "Kentucky",
  /* 34 */ "Troy",
  /* 35 */ "Pittsburgh",
  /* 36 */ "UC Santa Barbara",
  /* 37 */ "East Carolina",
  /* 38 */ "Virginia Tech",
  /* 39 */ "TCU",
  /* 40 */ "Arizona State",
  /* 41 */ "Clemson",
  /* 42 */ "NC State",
  /* 43 */ "Purdue",
  /* 44 */ "Michigan",
  /* 45 */ "Kansas State",
  /* 46 */ "Gonzaga",
  /* 47 */ "Arkansas State",
  /* 48 */ "California",
  /* 49 */ "Baylor",
  /* 50 */ "LSU",
  /* 51 */ "South Alabama",
  /* 52 */ "UAB",
  /* 53 */ "Notre Dame",
  /* 54 */ "Dallas Baptist",
  /* 55 */ "Iowa",
  /* 56 */ "Vanderbilt",
  /* 57 */ "Cal Poly",
  /* 58 */ "Rice",
  /* 59 */ "BYU",
  /* 60 */ "South Florida",
  /* 61 */ "Washington State",
  /* 62 */ "Duke",
  /* 63 */ "Maryland",
  /* 64 */ "Ohio State",
  /* 65 */ "Louisville",
  /* 66 */ "Minnesota",
  /* 67 */ "Creighton",
  /* 68 */ "UC San Diego",
  /* 69 */ "Charlotte",
  /* 70 */ "Illinois",
  /* 71 */ "San Diego State",
];

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

function teamAvgOVR(players: RealPlayer[]): number {
  if (players.length === 0) return 300;
  const total = players.reduce((s, p) => s + calculateOVR(p as Parameters<typeof calculateOVR>[0]), 0);
  return total / players.length;
}

function targetOVR(rank: number): number {
  return 385 - (rank - 1) * (125 / 141);
}

// ─── Collect all unique team names from RAW_UNCALIBRATED_ROSTERS ──────────
const NATIONAL_TOTAL = 142; // Exactly 142 in-game teams get unique 1–142 ranks
const allTeams = Object.keys(RAW_UNCALIBRATED_ROSTERS);
const top71Set = new Set(TOP_71_ORDER);

// Compute current OVR per team using raw (unscaled) rosters
const teamOVRs: { name: string; currentOVR: number }[] = allTeams.map(name => ({
  name,
  currentOVR: teamAvgOVR(RAW_UNCALIBRATED_ROSTERS[name]),
}));

// Teams NOT in the top-71 list, sorted by current OVR descending
const remaining = teamOVRs
  .filter(t => !top71Set.has(t.name))
  .sort((a, b) => b.currentOVR - a.currentOVR);

// Build the national rank map for exactly 142 teams:
//   ranks 1–71:  the RPI-ordered top-71 list
//   ranks 72–142: next 71 teams by current OVR
// Any teams beyond rank 142 are capped at rank 142 (share the floor target)
const nationalRankMap = new Map<string, number>();
TOP_71_ORDER.forEach((name, i) => {
  if (allTeams.includes(name)) {
    nationalRankMap.set(name, i + 1);
  }
});
const REMAINING_SLOTS = NATIONAL_TOTAL - TOP_71_ORDER.length; // 71
remaining.forEach((t, i) => {
  const rank = Math.min(TOP_71_ORDER.length + 1 + i, NATIONAL_TOTAL);
  nationalRankMap.set(t.name, rank);
});

// ─── Compute scale factors ─────────────────────────────────────────────────
interface TeamCalib {
  name: string;
  rank: number;
  currentOVR: number;
  target: number;
  scaleFactor: number;
}

const calibrations: TeamCalib[] = [];
for (const [name, rank] of nationalRankMap.entries()) {
  const currentOVR = teamAvgOVR(RAW_UNCALIBRATED_ROSTERS[name]);
  const target = targetOVR(rank);
  const scaleFactor = target / currentOVR;
  calibrations.push({ name, rank, currentOVR: Math.round(currentOVR), target: Math.round(target), scaleFactor });
}
calibrations.sort((a, b) => a.rank - b.rank);

// ─── Print summary table ───────────────────────────────────────────────────
console.log(`\nTotal teams in game: ${allTeams.length} — ranked: ${NATIONAL_TOTAL} (${allTeams.length - NATIONAL_TOTAL} teams share rank ${NATIONAL_TOTAL})`);
console.log(`\n${"Rank".padStart(4)}  ${"Team".padEnd(32)}  ${"Current".padStart(7)}  ${"Target".padStart(6)}  ${"Scale".padStart(6)}`);
console.log("-".repeat(70));
for (const c of calibrations) {
  const diff = Math.round(c.target) - c.currentOVR;
  const diffStr = (diff >= 0 ? "+" : "") + diff;
  console.log(
    `${String(c.rank).padStart(4)}  ${c.name.padEnd(32)}  ${String(c.currentOVR).padStart(7)}  ${String(Math.round(c.target)).padStart(6)}  ${c.scaleFactor.toFixed(3).padStart(6)}  (${diffStr})`
  );
}

// ─── Output server/rosterScaleFactors.ts ──────────────────────────────────
const lines: string[] = [
  "/**",
  " * Auto-generated by scripts/recalibrate-rosters.ts",
  " * Maps each team name to a numeric scale factor for player attribute recalibration.",
  " * ScaleFactor = targetAvgOVR / currentAvgOVR",
  " * Applied to: hitForAvg, power, speed, arm, fielding, errorResistance, stealing,",
  " *             velocity, control, stamina, stuff, clutch, vsLHP, grit, running,",
  " *             throwing, recovery, wRISP, vsLefty, poise, heater, agile",
  " * Each attribute clamped to [20, 99] after scaling.",
  " */",
  "",
  `export const TOTAL_NATIONAL_TEAMS = ${NATIONAL_TOTAL};`,
  "",
  "export const NATIONAL_RANKS: Record<string, number> = {",
];
for (const c of calibrations) {
  lines.push(`  ${JSON.stringify(c.name)}: ${c.rank},`);
}
lines.push("};");
lines.push("");
lines.push("export const ROSTER_SCALE_FACTORS: Record<string, number> = {");
for (const c of calibrations) {
  lines.push(`  ${JSON.stringify(c.name)}: ${c.scaleFactor.toFixed(6)},`);
}
lines.push("};");
lines.push("");

const outPath = path.join(__dirname, "..", "server", "rosterScaleFactors.ts");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`\n✅ Wrote ${outPath}`);
console.log("   Import ROSTER_SCALE_FACTORS and NATIONAL_RANKS in server/realRosters.ts to apply.");
