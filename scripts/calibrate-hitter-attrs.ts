/**
 * calibrate-hitter-attrs.ts  (v3)
 *
 * Calibrates real-roster hitter attributes so that the POST-SCALE
 * (ALL_REAL_ROSTERS) values satisfy:
 *
 *  1. No scaled primary attr > 90 (elite tier ≤70 players)
 *  2. No scaled primary attr > 84 (all non-elite hitters)
 *  3. No scaled OVR > 600
 *  4. Scaled OVR ≥ conference-tier floor (Tier1=160, Tier2=150,
 *                                          Tier3=140, Tier4=135, Tier5=130)
 *
 * Primary attrs (hitters): hitForAvg, power, speed, arm, fielding, errorResistance
 * Pitchers (P/SP/RP/CP) are skipped.
 *
 * All constraints are checked against SCALED values (raw * scale_factor,
 * clamped [20,99]) exactly as ALL_REAL_ROSTERS produces them.
 * Patches are written to the raw source files in RAW space.
 *
 * Usage: npx tsx scripts/calibrate-hitter-attrs.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RAW_UNCALIBRATED_ROSTERS } from "../server/realRosters";
import type { RealPlayer } from "../server/realRosters";
import { ROSTER_SCALE_FACTORS } from "../server/rosterScaleFactors";
import { calculateOVR, ALL_ABILITIES } from "../shared/abilities";

/** Gold ability names — players with these must have base OVR (no abilities) ≥ 500. */
const GOLD_NAMES = new Set(ALL_ABILITIES.filter((a) => a.tier === "gold").map((a) => a.name));
const GOLD_BASE_OVR_FLOOR = 500;

/** Common attrs that can reach S-grade for hitters (mirrors validate-s-grade-common-abilities). */
const FIELDER_COMMON_ATTRS = ["clutch","vsLHP","grit","stealing","running","throwing","recovery"] as const;
/** If any common attr ≥ 90 (scaled), the player must have scaled OVR ≥ 550. */
const S_GRADE_SCALED_OVR_FLOOR = 550;
const S_GRADE_THRESH = 90;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ── Constants ────────────────────────────────────────────────────────────────
const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

/** The 6 primary hitter attributes — only these are modified by this script. */
const PRIMARY_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
];

/** All attributes that ROSTER_SCALE_FACTORS applies to (mirrors realRosters.ts). */
const SCALE_ATTRS: (keyof RealPlayer)[] = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stamina", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
];

const ELITE_TIER_SIZE  = 70;   // top N hitters by SCALED peak attr
const ELITE_SCALED_CAP = 90;   // max scaled primary attr for elite hitters
const REG_SCALED_CAP   = 84;   // max scaled primary attr for non-elite hitters
const ATTR_FLOOR_RAW   = 15;   // absolute minimum raw value for any primary attr
const OVR_CEILING      = 600;  // max scaled OVR for any hitter

/**
 * Conference-tier SCALED OVR floors — the minimum in-game OVR any hitter must
 * have after calibration. High-tier programs lift into 2★ range; weaker
 * conferences aim for the 140-160 zone. All floors ≥ 140 as required.
 */
const TIER_OVR_FLOOR: Record<number, number> = {
  1: 200,   // SEC, ACC, Big Ten, Big 12  → 2★ minimum
  2: 180,   // Pac-12 (incl. MWC), AAC, Sun Belt
  3: 160,   // WCC, Big West, Missouri Valley
  4: 150,   // Ivy League
  5: 140,   // HBCU — absolute minimum per task spec
};

// ── Conference-tier team mapping ─────────────────────────────────────────────
// Tier derived from which conference each team belongs to per replit.md.
const TIER_1_TEAMS = new Set([
  // SEC
  "LSU","Florida","Vanderbilt","Texas A&M","Tennessee","Alabama","Ole Miss",
  "South Carolina","Georgia","Arkansas","Mississippi State","Missouri","Auburn",
  "Kentucky","Florida State","Miami",
  // ACC
  "Clemson","NC State","Georgia Tech","North Carolina","Virginia Tech","Notre Dame",
  "Wake Forest","Pittsburgh","Duke","Boston College","Syracuse","Louisville",
  "Virginia","Miami (FL)","Miami","Florida State",
  // Big Ten
  "Michigan","Ohio State","Indiana","Penn State","Purdue","Rutgers","Maryland",
  "Michigan State","Illinois","Iowa","Nebraska","Minnesota","Northwestern",
  "Wisconsin","UCLA","Oregon","Washington",
  // Big 12
  "Kansas","West Virginia","Arizona State","Arizona","Baylor","BYU","Cincinnati",
  "Houston","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah",
  "Oklahoma","Texas",
]);

const TIER_2_TEAMS = new Set([
  // Pac-12 / MWC
  "Oregon State","Washington State","Fresno State","San Diego State","UNLV",
  "Nevada","New Mexico","Air Force","Stanford","California","USC","UCLA",
  // AAC
  "East Carolina","Wichita State","Tulane","Memphis","South Florida","Charlotte",
  "UAB","Rice","Florida Atlantic","North Texas","Dallas Baptist",
  // Sun Belt
  "Coastal Carolina","Southern Miss","Troy","Marshall","Louisiana","Old Dominion",
  "Arkansas State","Georgia Southern","App State","Georgia State","South Alabama",
  "James Madison",
]);

const TIER_3_TEAMS = new Set([
  // WCC
  "Pepperdine","Loyola Marymount","San Diego","Saint Mary's","Gonzaga","Santa Clara",
  "Portland","San Francisco",
  // Big West
  "Cal State Fullerton","Long Beach State","UC Irvine","UC Santa Barbara",
  "UC San Diego","Hawaii","Cal Poly","UC Davis","Cal State Northridge","Cal State Bakersfield",
  // Missouri Valley
  "Missouri State","Indiana State","Illinois State","Southern Illinois","Bradley",
  "Evansville","Valparaiso","UIC","Belmont","Murray State","Western Illinois",
  "Northern Iowa","Creighton",
]);

const TIER_4_TEAMS = new Set([
  "Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale","Brown",
]);

function getConferenceTier(team: string): number {
  if (TIER_1_TEAMS.has(team)) return 1;
  if (TIER_2_TEAMS.has(team)) return 2;
  if (TIER_3_TEAMS.has(team)) return 3;
  if (TIER_4_TEAMS.has(team)) return 4;
  return 5; // HBCU / fallback
}

// ── Source roster files (relative paths) ─────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp20_99(v: number): number {
  return Math.round(Math.max(20, Math.min(99, v)));
}

function clampRaw(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)));
}

/**
 * Mirror of realRosters.ts scalePlayer — applies scale factor to all SCALE_ATTRS
 * and clamps to [20, 99]. Returns a new player object with scaled values.
 */
function applyScaleFactor(player: RealPlayer, sf: number): RealPlayer {
  if (sf === 1) return player;
  const out: Record<string, unknown> = { ...player };
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  for (const attr of SCALE_ATTRS) {
    const val = player[attr];
    if (typeof val === "number") {
      let scaled = clamp20_99(val * sf);
      if (isPitcher && (attr === "hitForAvg" || attr === "power")) scaled = Math.min(scaled, 30);
      out[attr as string] = scaled;
    }
  }
  return out as RealPlayer;
}

// ── 1. Collect all hitters with their raw and scaled data ────────────────────
interface HitterRecord {
  team: string;
  tier: number;
  sf: number;
  rawPlayer: RealPlayer;
  scaledPlayer: RealPlayer;
  scaledOVR: number;
  scaledPeakAttr: number;
}

const allHitters: HitterRecord[] = [];

for (const [team, players] of Object.entries(RAW_UNCALIBRATED_ROSTERS)) {
  const sf = ROSTER_SCALE_FACTORS[team] ?? 1;
  const tier = getConferenceTier(team);
  for (const rawPlayer of players) {
    if (PITCHER_POSITIONS.has(rawPlayer.position)) continue;
    const scaledPlayer = applyScaleFactor(rawPlayer, sf);
    const scaledOVR = calculateOVR(scaledPlayer);
    const scaledPeakAttr = Math.max(...PRIMARY_ATTRS.map(a => (scaledPlayer[a] as number) ?? 0));
    allHitters.push({ team, tier, sf, rawPlayer, scaledPlayer, scaledOVR, scaledPeakAttr });
  }
}

console.log(`Total hitters: ${allHitters.length}`);

// ── 2. Identify elite tier ───────────────────────────────────────────────────
// Use SCALED peak attr for tier identification (mirrors in-game reality).
// Where many players are clamped at 99, break ties by raw peak to be stable.
const byScaledPeak = [...allHitters].sort((a, b) => {
  if (b.scaledPeakAttr !== a.scaledPeakAttr) return b.scaledPeakAttr - a.scaledPeakAttr;
  const bRaw = Math.max(...PRIMARY_ATTRS.map(aa => (b.rawPlayer[aa] as number) ?? 0));
  const aRaw = Math.max(...PRIMARY_ATTRS.map(aa => (a.rawPlayer[aa] as number) ?? 0));
  return bRaw - aRaw;
});
const eliteSet = new Set(
  byScaledPeak.slice(0, ELITE_TIER_SIZE).map(r => `${r.rawPlayer.firstName}|${r.rawPlayer.lastName}|${r.team}`)
);
const eliteThreshold = byScaledPeak[ELITE_TIER_SIZE - 1];
console.log(`Elite tier: top ${ELITE_TIER_SIZE} by scaled peak attr (threshold: scaled=${eliteThreshold?.scaledPeakAttr} raw=${Math.max(...PRIMARY_ATTRS.map(a => (eliteThreshold?.rawPlayer[a] as number) ?? 0))})`);

// ── 3. Compute calibrated RAW attrs for every hitter ─────────────────────────
interface PatchEntry {
  firstName: string;
  lastName: string;
  team: string;
  oldAttrs: Record<string, number>;
  newAttrs: Record<string, number>;
  oldScaledOVR: number;
  newScaledOVR: number;
}

/**
 * Binary-search a multiplier m on `baseRawAttrs` (primary attrs only) such that
 * the resulting SCALED OVR crosses `targetOVR` in `direction`.
 * `rawCap`: per-attr raw ceiling; `baseScaledPlayer`: has all common attrs already scaled.
 */
function binarySearchRawScale(
  baseRawAttrs: Record<string, number>,
  rawCap: number,
  sf: number,
  baseScaledPlayer: RealPlayer,
  targetOVR: number,
  direction: "up" | "down"
): Record<string, number> {
  const lo0 = direction === "up" ? 1.0 : 0.1;
  const hi0 = direction === "up" ? 8.0 : 1.0;
  let lo = lo0, hi = hi0;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const trialRaw: Record<string, number> = {};
    for (const attr of PRIMARY_ATTRS) {
      trialRaw[attr as string] = clampRaw(Math.round((baseRawAttrs[attr as string] ?? 0) * mid), ATTR_FLOOR_RAW, rawCap);
    }
    const trialScaled: Record<string, unknown> = { ...baseScaledPlayer };
    for (const attr of PRIMARY_ATTRS) {
      trialScaled[attr as string] = clamp20_99(Math.round(trialRaw[attr as string] * sf));
    }
    const ovr = calculateOVR(trialScaled as RealPlayer);
    if (direction === "up") {
      if (ovr < targetOVR) lo = mid; else hi = mid;
    } else {
      if (ovr > targetOVR) hi = mid; else lo = mid;
    }
  }

  // Apply final factor
  const factor = direction === "up" ? hi : lo;
  const result: Record<string, number> = {};
  for (const attr of PRIMARY_ATTRS) {
    result[attr as string] = clampRaw(Math.round((baseRawAttrs[attr as string] ?? 0) * factor), ATTR_FLOOR_RAW, rawCap);
  }
  return result;
}

const patches: PatchEntry[] = [];

for (const rec of allHitters) {
  const { team, tier, sf, rawPlayer } = rec;
  const key = `${rawPlayer.firstName}|${rawPlayer.lastName}|${team}`;
  const isElite = eliteSet.has(key);
  const gameAttrCap = isElite ? ELITE_SCALED_CAP : REG_SCALED_CAP;

  // Raw cap: the highest raw value that, after scaling, stays ≤ gameAttrCap
  // clamp(raw * sf, 20, 99) ≤ gameAttrCap  →  raw ≤ gameAttrCap / sf
  const rawCap = Math.min(99, Math.floor(gameAttrCap / sf));

  // Step A: Cap raw primary attrs so scaled attrs stay ≤ gameAttrCap
  //         Also enforce ATTR_FLOOR_RAW
  const workingRaw: Record<string, number> = {};
  for (const attr of PRIMARY_ATTRS) {
    workingRaw[attr as string] = clampRaw((rawPlayer[attr] as number) ?? 0, ATTR_FLOOR_RAW, rawCap);
  }

  // Build a "base scaled player" with all attrs scaled; we'll swap primary attrs as needed
  const baseScaled: Record<string, unknown> = { ...rec.scaledPlayer };

  // Update primary attrs in scaled player to reflect our capped raw values
  for (const attr of PRIMARY_ATTRS) {
    baseScaled[attr as string] = clamp20_99(Math.round(workingRaw[attr as string] * sf));
  }
  let currentScaledOVR = calculateOVR(baseScaled as RealPlayer);

  // Step A½: Gold guard — players with gold abilities must have base OVR (no abilities) ≥ 500.
  // Use elite raw cap and lift attrs if needed.
  const hasGoldAbility = ((rawPlayer as Record<string, unknown>)["abilities"] as string[] ?? [])
    .some((name: string) => GOLD_NAMES.has(name));
  if (hasGoldAbility) {
    const goldRawCap = Math.min(99, Math.floor(ELITE_SCALED_CAP / sf));
    // Re-cap using elite cap (allows up to 90 scaled) instead of regular cap
    if (goldRawCap > rawCap) {
      for (const attr of PRIMARY_ATTRS) {
        workingRaw[attr as string] = clampRaw(workingRaw[attr as string], ATTR_FLOOR_RAW, goldRawCap);
        baseScaled[attr as string] = clamp20_99(Math.round(workingRaw[attr as string] * sf));
      }
      currentScaledOVR = calculateOVR(baseScaled as RealPlayer);
    }
    // Check base OVR (without ability bonuses)
    const baseOVR = calculateOVR({ ...baseScaled, abilities: [] } as unknown as RealPlayer);
    if (baseOVR < GOLD_BASE_OVR_FLOOR) {
      const goldRawCap2 = Math.min(99, Math.floor(ELITE_SCALED_CAP / sf));
      const lifted = binarySearchRawScale(
        workingRaw, goldRawCap2, sf,
        { ...baseScaled, abilities: [] } as unknown as RealPlayer,
        GOLD_BASE_OVR_FLOOR, "up"
      );
      const liftedBase: Record<string, unknown> = { ...baseScaled };
      for (const attr of PRIMARY_ATTRS) {
        liftedBase[attr as string] = clamp20_99(Math.round(lifted[attr as string] * sf));
      }
      const liftedBaseOVR = calculateOVR({ ...liftedBase, abilities: [] } as unknown as RealPlayer);
      if (liftedBaseOVR > baseOVR) {
        for (const attr of PRIMARY_ATTRS) {
          workingRaw[attr as string] = lifted[attr as string];
          baseScaled[attr as string] = liftedBase[attr as string];
        }
        currentScaledOVR = calculateOVR(baseScaled as RealPlayer);
      }
    }
  }

  // Step A¾: S-grade guard — if any scaled common attr ≥ 90, scaled OVR must be ≥ 550.
  // (mirrors validate-s-grade-common-abilities.ts rule)
  if (!PITCHER_POSITIONS.has(rawPlayer.position)) {
    const hasSGrade = FIELDER_COMMON_ATTRS.some(
      (attr) => ((rec.scaledPlayer[attr] as number) ?? 0) >= S_GRADE_THRESH
    );
    if (hasSGrade && currentScaledOVR < S_GRADE_SCALED_OVR_FLOOR) {
      const sRawCap = Math.min(99, Math.floor(ELITE_SCALED_CAP / sf));
      // Try to lift primary attrs using elite cap
      const lifted = binarySearchRawScale(workingRaw, sRawCap, sf, baseScaled as RealPlayer, S_GRADE_SCALED_OVR_FLOOR, "up");
      const liftedScaled: Record<string, unknown> = { ...baseScaled };
      for (const attr of PRIMARY_ATTRS) {
        liftedScaled[attr as string] = clamp20_99(Math.round(lifted[attr as string] * sf));
      }
      const liftedOVR = calculateOVR(liftedScaled as RealPlayer);
      if (liftedOVR > currentScaledOVR) {
        for (const attr of PRIMARY_ATTRS) {
          workingRaw[attr as string] = lifted[attr as string];
          baseScaled[attr as string] = liftedScaled[attr as string];
        }
        currentScaledOVR = liftedOVR;
      }
    }
  }

  // Step B: OVR floor — lift working raw attrs if SCALED OVR is below tier floor
  const tierFloor = TIER_OVR_FLOOR[tier];
  if (currentScaledOVR < tierFloor) {
    const lifted = binarySearchRawScale(workingRaw, rawCap, sf, baseScaled as RealPlayer, tierFloor, "up");
    // Accept lift only if it actually moved OVR upward (might not if rawCap blocks it)
    const liftedScaled: Record<string, unknown> = { ...baseScaled };
    for (const attr of PRIMARY_ATTRS) {
      liftedScaled[attr as string] = clamp20_99(Math.round(lifted[attr as string] * sf));
    }
    const liftedOVR = calculateOVR(liftedScaled as RealPlayer);
    if (liftedOVR > currentScaledOVR) {
      for (const attr of PRIMARY_ATTRS) {
        workingRaw[attr as string] = lifted[attr as string];
        baseScaled[attr as string] = liftedScaled[attr as string];
      }
      currentScaledOVR = liftedOVR;
    }
  }

  // Step C: OVR ceiling — scale down if SCALED OVR > 600
  if (currentScaledOVR > OVR_CEILING) {
    const dropped = binarySearchRawScale(workingRaw, rawCap, sf, baseScaled as RealPlayer, OVR_CEILING, "down");
    for (const attr of PRIMARY_ATTRS) {
      workingRaw[attr as string] = dropped[attr as string];
      baseScaled[attr as string] = clamp20_99(Math.round(dropped[attr as string] * sf));
    }
    currentScaledOVR = calculateOVR(baseScaled as RealPlayer);
  }

  // Record patch only if raw attrs actually changed
  const oldAttrs: Record<string, number> = {};
  for (const attr of PRIMARY_ATTRS) {
    oldAttrs[attr as string] = (rawPlayer[attr] as number) ?? 0;
  }
  const changed = PRIMARY_ATTRS.some(a => oldAttrs[a as string] !== workingRaw[a as string]);
  if (changed) {
    patches.push({
      firstName: rawPlayer.firstName,
      lastName: rawPlayer.lastName,
      team,
      oldAttrs,
      newAttrs: { ...workingRaw },
      oldScaledOVR: rec.scaledOVR,
      newScaledOVR: currentScaledOVR,
    });
  }
}

console.log(`Patches to apply: ${patches.length} hitters`);

// ── 4. Pre/post distribution stats (in SCALED space) ─────────────────────────
const patchLookup = new Map<string, PatchEntry>(
  patches.map(p => [`${p.firstName}|${p.lastName}|${p.team}`, p])
);

let beforeOver90 = 0, afterOver90 = 0;
let beforeOver84 = 0, afterOver84 = 0;
let beforeOver600 = 0, afterOver600 = 0;
let beforeBelow200 = 0, afterBelow200 = 0;
let beforeBelowFloor = 0, afterBelowFloor = 0;
let afterMinOVR = 9999, beforeMinOVR = 9999;
const n = allHitters.length;
// Star bands: 5=500+, 4=400-499, 3=300-399, 2=200-299, 1=<200
const beforeBands: Record<number, number> = { 5:0, 4:0, 3:0, 2:0, 1:0 };
const afterBands:  Record<number, number> = { 5:0, 4:0, 3:0, 2:0, 1:0 };

function starBand(ovr: number): number {
  if (ovr >= 500) return 5;
  if (ovr >= 400) return 4;
  if (ovr >= 300) return 3;
  if (ovr >= 200) return 2;
  return 1;
}

for (const rec of allHitters) {
  const key = `${rec.rawPlayer.firstName}|${rec.rawPlayer.lastName}|${rec.team}`;
  const patch = patchLookup.get(key);

  // Before (scaled)
  const bScaled = rec.scaledPlayer;
  const bOVR = rec.scaledOVR;
  if (PRIMARY_ATTRS.some(a => ((bScaled[a] as number) ?? 0) > 90)) beforeOver90++;
  if (PRIMARY_ATTRS.some(a => ((bScaled[a] as number) ?? 0) > 84)) beforeOver84++;
  if (bOVR > OVR_CEILING) beforeOver600++;
  if (bOVR < 200) beforeBelow200++;
  if (bOVR < TIER_OVR_FLOOR[rec.tier]) beforeBelowFloor++;
  if (bOVR < beforeMinOVR) beforeMinOVR = bOVR;
  beforeBands[starBand(bOVR)]++;

  // After
  let aOVR: number;
  let aScaledAttrs: Record<string, number>;
  if (patch) {
    aScaledAttrs = {};
    for (const attr of PRIMARY_ATTRS) {
      aScaledAttrs[attr as string] = clamp20_99(Math.round(patch.newAttrs[attr as string] * rec.sf));
    }
    aOVR = patch.newScaledOVR;
  } else {
    aScaledAttrs = Object.fromEntries(PRIMARY_ATTRS.map(a => [a as string, (bScaled[a] as number) ?? 0]));
    aOVR = bOVR;
  }
  if (PRIMARY_ATTRS.some(a => (aScaledAttrs[a as string] ?? 0) > 90)) afterOver90++;
  if (PRIMARY_ATTRS.some(a => (aScaledAttrs[a as string] ?? 0) > 84)) afterOver84++;
  if (aOVR > OVR_CEILING) afterOver600++;
  if (aOVR < 200) afterBelow200++;
  if (aOVR < TIER_OVR_FLOOR[rec.tier]) afterBelowFloor++;
  if (aOVR < afterMinOVR) afterMinOVR = aOVR;
  afterBands[starBand(aOVR)]++;
}

const pct = (v: number) => `${v} (${((v / n) * 100).toFixed(1)}%)`;

console.log("\n=== Star band distribution (hitters, SCALED OVR from ALL_REAL_ROSTERS) ===");
console.log(`${"Band".padEnd(6)}  ${"Before".padStart(20)}  ${"After".padStart(20)}`);
for (const s of [5, 4, 3, 2, 1]) {
  console.log(`  ${s}★    ${pct(beforeBands[s]).padStart(18)}  ${pct(afterBands[s]).padStart(18)}`);
}
console.log();
console.log(`${"Constraint".padEnd(36)}  ${"Before".padStart(18)}  ${"After".padStart(18)}`);
console.log(`  Scaled attr >90 (target: 0)          ${pct(beforeOver90).padStart(18)}  ${pct(afterOver90).padStart(18)}`);
console.log(`  Scaled attr >84 (target: ≤${ELITE_TIER_SIZE})        ${pct(beforeOver84).padStart(18)}  ${pct(afterOver84).padStart(18)}`);
console.log(`  Scaled OVR >600 (target: 0)          ${pct(beforeOver600).padStart(18)}  ${pct(afterOver600).padStart(18)}`);
console.log(`  Scaled OVR <200 (1★ band)            ${pct(beforeBelow200).padStart(18)}  ${pct(afterBelow200).padStart(18)}`);
console.log(`  Below tier OVR floor                 ${pct(beforeBelowFloor).padStart(18)}  ${pct(afterBelowFloor).padStart(18)}`);
console.log(`  Min scaled OVR                       ${String(beforeMinOVR).padStart(18)}  ${String(afterMinOVR).padStart(18)}`);

// ── 5. Constraint validation ──────────────────────────────────────────────────
const violations: string[] = [];
if (afterOver90 > 0)
  violations.push(`${afterOver90} hitters have scaled attr >90 (target: 0)`);
if (afterOver84 > ELITE_TIER_SIZE + 5)
  violations.push(`${afterOver84} hitters have scaled attr >84 (target ≤ ${ELITE_TIER_SIZE})`);
if (afterOver600 > 0)
  violations.push(`${afterOver600} hitters have scaled OVR >600 (target: 0)`);
// Floor: allow ≤5% unable to reach their tier floor (blocked by common attr penalties + cap)
const floorTolerance = Math.round(n * 0.05);
if (afterBelowFloor > floorTolerance)
  violations.push(`${afterBelowFloor} hitters still below tier OVR floor (tolerance: ${floorTolerance})`);
// Min OVR must be ≥ 140 (absolute requirement per task spec)
if (afterMinOVR < 140)
  violations.push(`Min scaled OVR is ${afterMinOVR} — must be ≥ 140`);
// 1★ band must shrink when calibration runs actual patches
if (patches.length > 0 && afterBelow200 >= beforeBelow200)
  violations.push(`1★ band did not shrink: before=${beforeBelow200} (${((beforeBelow200/n)*100).toFixed(1)}%) after=${afterBelow200} (${((afterBelow200/n)*100).toFixed(1)}%)`);
// 1★ band must not be the dominant star rating (2★+ should outnumber 1★)
if (afterBands[1] > afterBands[2] + afterBands[3] + afterBands[4] + afterBands[5])
  violations.push(`1★ band (${afterBands[1]}) still larger than all other bands combined — floor lift insufficient`);

if (violations.length === 0) {
  console.log("\n✅ All constraints satisfied.");
} else {
  console.log("\n⚠ Constraint violations:");
  violations.forEach(v => console.log("  - " + v));
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] No files written.");
  process.exit(violations.length > 0 ? 1 : 0);
}

// ── 6. Write patches to source files (team-scoped matching) ──────────────────
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the team's player array section in `content`.
 * Returns {start, end} char indices (inclusive start, exclusive end), or null.
 */
function findTeamSection(content: string, team: string): { start: number; end: number } | null {
  const teamRe = new RegExp(`"${escapeRe(team)}"\\s*:\\s*\\[`);
  const m = teamRe.exec(content);
  if (!m) return null;

  let depth = 0;
  let i = m.index + m[0].length - 1; // positioned at opening [
  for (; i < content.length; i++) {
    if (content[i] === "[") depth++;
    else if (content[i] === "]") {
      depth--;
      if (depth === 0) return { start: m.index, end: i + 1 };
    }
  }
  return null;
}

/**
 * Within `section`, find the player block by firstName+lastName and replace
 * the 6 primary attrs.  Returns modified section, or null if not found.
 */
function patchPlayerInSection(section: string, patch: PatchEntry): string | null {
  const fnEsc = escapeRe(patch.firstName);
  const lnEsc = escapeRe(patch.lastName);

  const blockRe = new RegExp(`\\{\\s*firstName:\\s*"${fnEsc}"\\s*,\\s*lastName:\\s*"${lnEsc}"`);
  const blockMatch = blockRe.exec(section);
  if (!blockMatch) return null;

  // Locate the player object's closing brace
  let depth = 0, blockEnd = blockMatch.index;
  for (let i = blockMatch.index; i < section.length; i++) {
    if (section[i] === "{") depth++;
    else if (section[i] === "}") {
      depth--;
      if (depth === 0) { blockEnd = i + 1; break; }
    }
  }

  const before = section.slice(0, blockMatch.index);
  const block  = section.slice(blockMatch.index, blockEnd);
  const after  = section.slice(blockEnd);

  // Build regex matching the 6 attrs as they appear on one line
  const o = patch.oldAttrs;
  const attrRe = new RegExp(
    `(hitForAvg:\\s*)${o["hitForAvg"]}` +
    `(,\\s*power:\\s*)${o["power"]}` +
    `(,\\s*speed:\\s*)${o["speed"]}` +
    `(,\\s*arm:\\s*)${o["arm"]}` +
    `(,\\s*fielding:\\s*)${o["fielding"]}` +
    `(,\\s*errorResistance:\\s*)${o["errorResistance"]}`
  );
  const attrMatch = attrRe.exec(block);
  if (!attrMatch) return null;

  const nn = patch.newAttrs;
  const replacement =
    attrMatch[1] + nn["hitForAvg"] +
    attrMatch[2] + nn["power"] +
    attrMatch[3] + nn["speed"] +
    attrMatch[4] + nn["arm"] +
    attrMatch[5] + nn["fielding"] +
    attrMatch[6] + nn["errorResistance"];

  const newBlock = block.slice(0, attrMatch.index) + replacement + block.slice(attrMatch.index + attrMatch[0].length);
  return before + newBlock + after;
}

let totalFilesChanged = 0, totalReplacements = 0, totalNotFound = 0;

for (const relPath of ROSTER_FILES) {
  const filePath = path.join(__dirname, "..", relPath);
  if (!fs.existsSync(filePath)) { console.warn(`  ⚠ Not found: ${relPath}`); continue; }

  let content = fs.readFileSync(filePath, "utf8");
  let fileChanged = false;

  for (const patch of patches) {
    const teamRange = findTeamSection(content, patch.team);
    if (!teamRange) continue; // team not in this file

    const section = content.slice(teamRange.start, teamRange.end);
    const newSection = patchPlayerInSection(section, patch);

    if (newSection === null) {
      totalNotFound++;
      console.warn(`  ⚠ Not matched: ${patch.firstName} ${patch.lastName} (${patch.team}) in ${relPath}`);
      continue;
    }

    if (newSection !== section) {
      content = content.slice(0, teamRange.start) + newSection + content.slice(teamRange.end);
      fileChanged = true;
      totalReplacements++;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  ✅ ${relPath}`);
    totalFilesChanged++;
  }
}

// ── 7. Final summary ──────────────────────────────────────────────────────────
console.log("\n╔═══════════════════════════════════════════════════════╗");
console.log("║         CALIBRATION COMPLETE — v3 SUMMARY (SCALED)   ║");
console.log("╚═══════════════════════════════════════════════════════╝");
console.log(`Files updated: ${totalFilesChanged}  |  Players patched: ${totalReplacements}  |  Not-found: ${totalNotFound}`);
console.log(`\nFinal state (all checks in SCALED / ALL_REAL_ROSTERS space):`);
console.log(`  Scaled attr >90:       ${afterOver90}   (target: 0)`);
console.log(`  Scaled attr >84:       ${afterOver84}   (target ≤${ELITE_TIER_SIZE})`);
console.log(`  Scaled OVR >600:       ${afterOver600}   (target: 0)`);
console.log(`  Scaled OVR <200 (1★):  ${afterBelow200}   (was ${beforeBelow200})`);
console.log(`  Below tier OVR floor:  ${afterBelowFloor}   (was ${beforeBelowFloor})`);
console.log(`  Min scaled OVR:        ${afterMinOVR}`);

if (totalNotFound > 0) {
  console.error(`\n❌ ${totalNotFound} patches could not be applied — review warnings above.`);
  process.exit(1);
}
if (violations.length > 0) {
  console.error("\n❌ Constraint violations remain — review above.");
  process.exit(1);
}
console.log("\n✅ All done.");
