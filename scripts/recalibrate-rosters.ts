/**
 * Recalibrate all roster player attributes so each team's avg OVR aligns with
 * its real 2026 D1Baseball RPI-derived national rank.
 *
 * Formula: targetOVR = 355 - (rank - 1) * (175 / 141)
 *   rank #1  → ~355 OVR  (within the target 330-370 Tier 1 band)
 *   rank #71 → ~268 OVR
 *   rank #142 → ~180 OVR  (lower floor pulls weak-team players into below-avg band)
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
  /* 1  */ "Georgia Tech",
  /* 2  */ "North Carolina",
  /* 3  */ "Texas",             // #6 national seed, won SR — near-perfect match
  /* 4  */ "Georgia",           // was 6 → 4 | #3 national seed, won SR convincingly
  /* 5  */ "Florida",           // was 7 → 5 | #8 national seed
  /* 6  */ "Alabama",           // was 4 → 6 | #7 national seed
  /* 7  */ "Ole Miss",          // was 12 → 7 | unseeded host, won SR
  /* 8  */ "Oregon",            // was 11 → 8 | #11 national seed, won SR
  /* 9  */ "Arkansas",          // was 15 → 9 | won SR
  /* 10 */ "Nebraska",          // was 5 → 10 | #13 national seed — major drop
  /* 11 */ "Kansas",            // was 13 → 11 | #15 national seed, won SR
  /* 12 */ "UCLA",              // was 16 → 12 | #1 overall national seed — bump back up
  /* 13 */ "Texas A&M",         // was 9 → 13 | #12 national seed — drop
  /* 14 */ "Auburn",            // was 23 → 14 | #4 national seed, won SR — major jump
  /* 15 */ "Cal Poly",          // was 58 → 15 | won SR as unseeded host, beat #1 UCLA
  /* 16 */ "Mississippi State", // was 8 → 16 | #14 national seed, won SR
  /* 17 */ "West Virginia",     // was 10 → 17 | #16 national seed, won SR
  /* 18 */ "USC",               // was 27 → 18 | won SR, beat #12 Texas A&M — jump back up
  /* 19 */ "Oklahoma",          // was 18 → 19 | won SR, beat #2 Georgia Tech
  /* 20 */ "Troy",              // was 29 → 20 | won SR, beat #8 Florida
  /* 21 */ "Florida State",     // was 25 → 21 | #10 national seed — bump
  /* 22 */ "Wake Forest",       // was 14 → 22 | not in 2026 tournament — drop
  /* 23 */ "Tennessee",         // was 21 → 23 | lost SR to North Carolina
  /* 24 */ "Cincinnati",        // was 17 → 24 | lost SR to Mississippi State — drop
  /* 25 */ "Virginia",          // was 19 → 25 | lost SR to Little Rock — drop
  /* 26 */ "Boston College",    // was 26
  /* 27 */ "Saint Mary's",      // was 32 → 27 | lost SR to Cal Poly
  /* 28 */ "Virginia Tech",     // was 33 → 28
  /* 29 */ "UCF",               // was 24 → 29 | slight drop
  /* 30 */ "Kentucky",          // was 28 → 30 | lost SR to West Virginia
  /* 31 */ "Pittsburgh",        // was 30 → 31
  /* 32 */ "East Carolina",     // was 31 → 32 | lost SR to North Carolina
  /* 33 */ "Louisiana",         // was 22 → 33 | lost in regional — drop
  /* 34 */ "Miami",             // was 20 → 34 | lost SR to Troy — big drop
  /* 35 */ "Missouri State",    // was 34 → 35
  /* 36 */ "TCU",               // was 35 → 36
  /* 37 */ "Arizona State",     // was 37 | lost SR to Ole Miss
  /* 38 */ "Clemson",           // was 38
  /* 39 */ "NC State",          // was 39 | lost SR to Auburn
  /* 40 */ "Oregon State",      // was 40 | lost SR to Oregon
  /* 41 */ "Purdue",            // was 41
  /* 42 */ "Michigan",          // was 42
  /* 43 */ "Southern Miss",     // was 36 → 43 | lost as 4-seed to Little Rock — drop
  /* 44 */ "Kansas State",      // was 43 → 44
  /* 45 */ "Coastal Carolina",  // was 44 → 45 | lost SR to Florida State
  /* 46 */ "California",        // was 48 → 46 | modest bump (historically solid, now ACC)
  /* 47 */ "Gonzaga",           // was 45 → 47
  /* 48 */ "Oklahoma State",    // was 46 → 48 | lost SR to Alabama
  /* 49 */ "Arkansas State",    // was 47 → 49
  /* 50 */ "Baylor",            // was 49 → 50
  /* 51 */ "LSU",               // was 50 → 51
  /* 52 */ "South Alabama",     // was 51 → 52
  /* 53 */ "Washington",        // was 52 → 53
  /* 54 */ "UAB",               // was 53 → 54
  /* 55 */ "Notre Dame",        // was 54 → 55
  /* 56 */ "Dallas Baptist",    // was 55 → 56
  /* 57 */ "Iowa",              // was 56 → 57
  /* 58 */ "Vanderbilt",        // was 57 → 58
  /* 59 */ "Rice",              // was 59
  /* 60 */ "BYU",               // was 60
  /* 61 */ "South Florida",     // was 61
  /* 62 */ "UC Santa Barbara",  // was 62 | lost SR to Texas
  /* 63 */ "Washington State",  // was 63 | lost SR to Oregon
  /* 64 */ "Duke",              // was 64
  /* 65 */ "Maryland",          // was 65
  /* 66 */ "Ohio State",        // was 66
  /* 67 */ "Louisville",        // was 67
  /* 68 */ "Minnesota",         // was 68
  /* 69 */ "Creighton",         // was 69
  /* 70 */ "Stanford",          // NEW — historically elite (3 CWS titles), now ACC
  /* 71 */ "UC San Diego",      // was 70
  // Charlotte drops to auto-sort (was 71)
  // Illinois and San Diego State fall to ~72-73 (determined by current OVR)
];

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

function teamAvgOVR(players: RealPlayer[]): number {
  if (players.length === 0) return 300;
  const total = players.reduce((s, p) => s + calculateOVR(p as Parameters<typeof calculateOVR>[0]), 0);
  return total / players.length;
}

function targetOVR(rank: number): number {
  // Calibrated for current raw attr levels (~170-270 raw OVR range after hitter-calibration passes).
  // Rank 1 target ~300, rank 149 target ~176; produces scale factors ≈0.85–1.6 range.
  // Bottom anchor < raw OVR for weakest teams so they get sf < 1.0, allowing weak individual
  // players to fall into the sub-150 OVR range (as the validate-ovr-bands 100-149 band requires).
  // This formula is the right range after the calibrate-hitter-attrs feedback loop stabilized.
  return 340 - (rank - 1) * (180 / 148);
}

// ─── Collect all unique team names from RAW_UNCALIBRATED_ROSTERS ──────────
const NATIONAL_TOTAL = 149; // All 149 in-game teams get unique 1–149 ranks
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
lines.push("/**");
lines.push(" * Per-team pitcher attribute multiplier applied ON TOP of the base ROSTER_SCALE_FACTORS entry.");
lines.push(" * Default = 1.0 (no override). Values > 1 boost pitcher attrs; values < 1 reduce them.");
lines.push(" * Used to fix RPI rank drift caused by H-P imbalances — specifically teams whose");
lines.push(" * hitters are over-powered relative to their pitching staff.");
lines.push(" */");
lines.push("export const PITCHER_SCALE_OVERRIDES: Record<string, number> = {");
lines.push("  // These teams' hitters are pulling the team avg well above their pitching.");
lines.push("  // Boost pitchers slightly so the H-P gap narrows and OVR rank drops closer to intent.");
lines.push('  "Louisiana":       1.08,');
lines.push('  "Clemson":         1.05,');
lines.push('  "Virginia Tech":   1.06,');
lines.push('  "Southern Miss":   1.05,');
lines.push('  "Georgia":         1.04,');
lines.push('  "Georgia Tech":    1.03,');
lines.push("};");
lines.push("");
lines.push("/**");
lines.push(" * Per-team hitter attribute multiplier applied ON TOP of the base ROSTER_SCALE_FACTORS entry.");
lines.push(" * Default = 1.0 (no override). Values < 1 reduce hitter attrs to close inflated H-P gaps.");
lines.push(" * Only used for teams that are ranked too high due to over-powered hitters — NOT used to");
lines.push(" * boost under-performing teams (that's handled via ROSTER_SCALE_FACTORS instead).");
lines.push(" */");
lines.push("export const HITTER_SCALE_OVERRIDES: Record<string, number> = {");
lines.push("  // Reduce hitters to narrow inflated H-P gap (ranks these teams lower)");
lines.push('  "Louisiana":       0.92,');
lines.push('  "Clemson":         0.95,');
lines.push('  "Virginia Tech":   0.94,');
lines.push('  "Southern Miss":   0.94,');
lines.push('  "Georgia":         0.96,');
lines.push('  "Georgia Tech":    0.96,');
lines.push("};");
lines.push("");

const outPath = path.join(__dirname, "..", "server", "rosterScaleFactors.ts");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`\n✅ Wrote ${outPath}`);
console.log("   Import ROSTER_SCALE_FACTORS and NATIONAL_RANKS in server/realRosters.ts to apply.");
