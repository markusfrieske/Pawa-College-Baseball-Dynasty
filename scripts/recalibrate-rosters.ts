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
  /* 3  */ "Texas",
  /* 4  */ "Alabama",
  /* 5  */ "Nebraska",
  /* 6  */ "Georgia",
  /* 7  */ "Florida",
  /* 8  */ "Mississippi State",
  /* 9  */ "Texas A&M",
  /* 10 */ "West Virginia",
  /* 11 */ "Oregon",          // rose: beat Yale as heavy favorite
  /* 12 */ "Ole Miss",        // rose: beat Arizona as mild favorite
  /* 13 */ "Kansas",
  /* 14 */ "Wake Forest",
  /* 15 */ "Arkansas",        // rose: beat Missouri State (peer)
  /* 16 */ "UCLA",            // DROPS: lost to Saint Mary's (~#80) — biggest upset
  /* 17 */ "Cincinnati",
  /* 18 */ "Oklahoma",
  /* 19 */ "Virginia",
  /* 20 */ "Miami",
  /* 21 */ "Tennessee",
  /* 22 */ "Louisiana",
  /* 23 */ "Auburn",          // DROPS: lost to Milwaukee — major upset
  /* 24 */ "UCF",
  /* 25 */ "Florida State",   // DROPS: lost to St. John's — significant upset
  /* 26 */ "Boston College",
  /* 27 */ "USC",             // DROPS: lost to Texas St — significant upset
  /* 28 */ "Kentucky",
  /* 29 */ "Troy",
  /* 30 */ "Pittsburgh",
  /* 31 */ "East Carolina",
  /* 32 */ "Saint Mary's",    // RISES: beat #1 UCLA — most dramatic upset
  /* 33 */ "Virginia Tech",
  /* 34 */ "Missouri State",  // DROPS: lost to Arkansas (peer)
  /* 35 */ "TCU",
  /* 36 */ "Southern Miss",   // DROPS: first-round exit for top-15 program
  /* 37 */ "Arizona State",
  /* 38 */ "Clemson",
  /* 39 */ "NC State",
  /* 40 */ "Oregon State",    // DROPS: lost to Washington (~#93) — big upset
  /* 41 */ "Purdue",
  /* 42 */ "Michigan",
  /* 43 */ "Kansas State",
  /* 44 */ "Coastal Carolina",// DROPS: lost to NIU — significant upset
  /* 45 */ "Gonzaga",
  /* 46 */ "Oklahoma State",  // DROPS: first-round exit
  /* 47 */ "Arkansas State",
  /* 48 */ "California",
  /* 49 */ "Baylor",
  /* 50 */ "LSU",
  /* 51 */ "South Alabama",
  /* 52 */ "Washington",      // RISES: beat Oregon State (#17) — major upset win
  /* 53 */ "UAB",
  /* 54 */ "Notre Dame",
  /* 55 */ "Dallas Baptist",
  /* 56 */ "Iowa",
  /* 57 */ "Vanderbilt",
  /* 58 */ "Cal Poly",
  /* 59 */ "Rice",
  /* 60 */ "BYU",
  /* 61 */ "South Florida",
  /* 62 */ "UC Santa Barbara",// DROPS: first-round exit for a top-40 program
  /* 63 */ "Washington State",
  /* 64 */ "Duke",
  /* 65 */ "Maryland",
  /* 66 */ "Ohio State",
  /* 67 */ "Louisville",
  /* 68 */ "Minnesota",
  /* 69 */ "Creighton",
  /* 70 */ "UC San Diego",
  /* 71 */ "Charlotte",
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
lines.push('  "Texas A&M":       1.07,');
lines.push('  "Wake Forest":     1.07,');
lines.push('  "Clemson":         1.05,');
lines.push('  "Virginia Tech":   1.06,');
lines.push('  "Southern Miss":   1.05,');
lines.push('  "Nebraska":        1.03,');
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
lines.push('  "Texas A&M":       0.94,');
lines.push('  "Wake Forest":     0.93,');
lines.push('  "Clemson":         0.95,');
lines.push('  "Virginia Tech":   0.94,');
lines.push('  "Southern Miss":   0.94,');
lines.push('  "Nebraska":        0.96,');
lines.push('  "Georgia":         0.96,');
lines.push('  "Georgia Tech":    0.96,');
lines.push("};");
lines.push("");

const outPath = path.join(__dirname, "..", "server", "rosterScaleFactors.ts");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`\n✅ Wrote ${outPath}`);
console.log("   Import ROSTER_SCALE_FACTORS and NATIONAL_RANKS in server/realRosters.ts to apply.");
