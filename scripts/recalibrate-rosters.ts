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

// Mirrors SCALE_ATTRS and COMMON_ATTRS_FOR_CLAMP from server/realRosters.ts.
const CAL_SCALE_ATTRS = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
] as const;
const CAL_COMMON_ATTRS = new Set([
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
]);
// Pitcher-only and hitter-only attr sets — mirrors PITCHER_ATTRS / HITTER_ATTRS in server/realRosters.ts.
const CAL_PITCHER_ATTRS = new Set([
  "velocity", "control", "stuff", "wRISP", "vsLefty", "poise", "heater", "agile", "recovery", "grit", "clutch",
]);
const CAL_HITTER_ATTRS = new Set([
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery",
]);

// H-P balance overrides that will be written to rosterScaleFactors.ts.
// The binary search MUST simulate these so calibration accounts for their OVR impact.
const HP_PITCHER_OVERRIDES: Record<string, number> = {
  "Louisiana": 1.08, "Clemson": 1.05, "Virginia Tech": 1.06,
  "Southern Miss": 1.05, "Georgia": 1.04, "Georgia Tech": 1.03,
};
const HP_HITTER_OVERRIDES: Record<string, number> = {
  "Louisiana": 0.92, "Clemson": 0.95, "Virginia Tech": 0.94,
  "Southern Miss": 0.94, "Georgia": 0.96, "Georgia Tech": 0.96,
};

// Compute ACTUAL avg OVR after applying scale + optional P/H multipliers.
// Mirrors server/realRosters.ts scalePlayer() including the P/H split logic.
// pitcherMult applies to PITCHER_ATTRS on pitchers; hitterMult applies to HITTER_ATTRS on hitters.
function computeActualAvgOVR(
  players: RealPlayer[],
  scale: number,
  pitcherMult = 1,
  hitterMult = 1,
): number {
  if (players.length === 0) return 300;
  let total = 0;
  for (const p of players) {
    const isPitcher = PITCHER_POSITIONS.has(p.position);
    const scaled = { ...p } as Record<string, unknown>;
    for (const attr of CAL_SCALE_ATTRS) {
      const val = p[attr];
      if (typeof val !== "number") continue;
      const minV = CAL_COMMON_ATTRS.has(attr) ? 10 : 20;
      // Determine effective factor including P/H multiplier
      let effFactor = scale;
      if (isPitcher && CAL_PITCHER_ATTRS.has(attr)) effFactor = scale * pitcherMult;
      else if (!isPitcher && CAL_HITTER_ATTRS.has(attr)) effFactor = scale * hitterMult;
      const sGradeCap = (val <= 90 || effFactor < 1) ? 89 : 99;
      let v = Math.round(Math.max(minV, Math.min(sGradeCap, val * effFactor)));
      if (isPitcher && (attr === "hitForAvg" || attr === "power")) v = Math.min(v, 30);
      scaled[attr] = v;
    }
    total += calculateOVR(scaled as Parameters<typeof calculateOVR>[0]);
  }
  return total / players.length;
}

// Target ACTUAL avg OVR for a team at national rank N.
// Anchored to the real post-scale distribution: rank 1 ≈ 395, rank 71 ≈ 289, rank 149 ≈ 170.
// Targets actual computed OVR (not a linear nominal) so the binary-search calibration
// can hit exact targets — eliminating the rank-gap drift caused by OVR formula non-linearity.
function targetActualOVR(rank: number): number {
  return Math.round(395 - (rank - 1) * (395 - 170) / 148);
}

// Binary search for the exact base scale factor such that
// computeActualAvgOVR(players, sf, pitcherMult, hitterMult) == target.
// Including P/H overrides in the search ensures the target OVR is hit AFTER
// those overrides are applied, keeping computed rank == NR for all teams.
function findScaleFactor(
  players: RealPlayer[],
  target: number,
  pitcherMult = 1,
  hitterMult = 1,
): number {
  let lo = 0.40, hi = 2.50;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (computeActualAvgOVR(players, mid, pitcherMult, hitterMult) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function teamRawAvgOVR(players: RealPlayer[]): number {
  if (players.length === 0) return 300;
  return players.reduce((s, p) => s + calculateOVR(p as Parameters<typeof calculateOVR>[0]), 0) / players.length;
}

// ─── Collect all unique team names from RAW_UNCALIBRATED_ROSTERS ──────────
const NATIONAL_TOTAL = 149; // All 149 in-game teams get unique 1–149 ranks
const allTeams = Object.keys(RAW_UNCALIBRATED_ROSTERS);
const top71Set = new Set(TOP_71_ORDER);

// Compute current OVR per team using raw (unscaled) rosters
const teamOVRs: { name: string; currentOVR: number }[] = allTeams.map(name => ({
  name,
  currentOVR: teamRawAvgOVR(RAW_UNCALIBRATED_ROSTERS[name]),
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
  const rawOVR = teamRawAvgOVR(RAW_UNCALIBRATED_ROSTERS[name]);
  const target = targetActualOVR(rank);
  const pitcherMult = HP_PITCHER_OVERRIDES[name] ?? 1;
  const hitterMult  = HP_HITTER_OVERRIDES[name]  ?? 1;
  const scaleFactor = findScaleFactor(RAW_UNCALIBRATED_ROSTERS[name], target, pitcherMult, hitterMult);
  calibrations.push({ name, rank, currentOVR: Math.round(rawOVR), target, scaleFactor });
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
  " * ScaleFactor is found by iterative binary search: computeActualAvgOVR(team, sf) = targetActualOVR(rank)",
  " * This eliminates rank-gap drift caused by OVR formula non-linearity (89-attr cap).",
  " * Applied to: hitForAvg, power, speed, arm, fielding, errorResistance, stealing,",
  " *             velocity, control, stuff, clutch, vsLHP, grit, running,",
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
lines.push("  // H-P balance fixes only: boost pitchers where hitters are over-powered relative to staff.");
lines.push("  // Rank correction is handled by the iterative calibration; no rank-correction entries here.");
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
lines.push(" * Default = 1.0 (no override). Values < 1 reduce hitter attrs; values > 1 boost them.");
lines.push(" * Only used for true H-P imbalance fixes, not rank correction.");
lines.push(" */");
lines.push("export const HITTER_SCALE_OVERRIDES: Record<string, number> = {");
lines.push("  // H-P balance fixes: reduce hitters to narrow inflated gap");
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
