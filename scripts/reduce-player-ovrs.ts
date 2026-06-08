/**
 * scripts/reduce-player-ovrs.ts
 * Binary-searches for a raw-attr multiplier per target player so that
 * after the full calibration pipeline (scalePlayer → applyGlobalAdjustments →
 * normalizeCommonAbilities → calculateOVR) the result equals the target OVR.
 *
 * Gold-gating note: enforceGoldOvrGate strips gold abilities when OVR < 500.
 * For targets < 500 that have gold abilities, the binary search targets a
 * pre-gate OVR = target (gold included). After gating the final OVR will be
 * ~9 lower (gold +15 → blue +6). Those cases are flagged below with ⚠.
 */

import { ROSTER_SCALE_FACTORS, PITCHER_SCALE_OVERRIDES, HITTER_SCALE_OVERRIDES } from "../server/rosterScaleFactors";
import { normalizeCommonAbilities } from "../server/normalizeCommonAbilities";
import { calculateOVR, getAbilityByName } from "../shared/abilities";

const SCALE_ATTRS = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "velocity", "control", "stuff",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery", "wRISP", "vsLefty", "poise", "heater", "agile",
] as const;

const COMMON_ATTRS = new Set([
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery",
  "wRISP", "vsLefty", "poise", "heater", "agile",
]);

const HITTER_ATTRS = new Set([
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance", "stealing",
  "clutch", "vsLHP", "grit", "running", "throwing", "recovery",
]);

function scalePlayer(p: Record<string, number | null>, factor: number, hitterMult: number): Record<string, number | null> {
  const result = { ...p };
  for (const attr of SCALE_ATTRS) {
    const val = result[attr];
    if (typeof val !== "number") continue;
    const minV = COMMON_ATTRS.has(attr) ? 10 : 20;
    let eff = factor;
    if (HITTER_ATTRS.has(attr)) eff = factor * hitterMult;
    const sGradeCap = (val <= 90 || eff < 1) ? 89 : 99;
    result[attr] = Math.round(Math.max(minV, Math.min(sGradeCap, val * eff)));
  }
  return result;
}

function applyGlobalAdjustments(p: Record<string, number | null>, position: string): Record<string, number | null> {
  const result = { ...p };
  if (position === "C") {
    if (typeof result.fielding === "number")
      result.fielding = Math.min(99, Math.round(result.fielding * 1.15));
    if (typeof result.errorResistance === "number")
      result.errorResistance = Math.min(99, Math.round(result.errorResistance * 1.15));
    if (typeof result.arm === "number")
      result.arm = Math.min(99, Math.round(result.arm * 1.10));
    if (typeof result.catcherAbility === "number")
      result.catcherAbility = Math.min(99, Math.round(result.catcherAbility * 1.20));
  }
  return result;
}

function computeOVR(
  rawAttrs: Record<string, number | null>,
  abilities: string[],
  position: string,
  firstName: string,
  lastName: string,
  teamName: string,
  conference: string,
): number {
  const sf = ROSTER_SCALE_FACTORS[teamName]   ?? 1;
  const hm = HITTER_SCALE_OVERRIDES[teamName] ?? 1;

  let p = scalePlayer(rawAttrs, sf, hm);
  p = applyGlobalAdjustments(p, position);

  const norm = normalizeCommonAbilities(
    { position, firstName, lastName, ...p } as Parameters<typeof normalizeCommonAbilities>[0],
    conference,
  );
  for (const [k, v] of Object.entries(norm)) {
    if (v !== null && v !== undefined) p[k] = v as number;
  }

  return calculateOVR({ position, abilities, ...p } as Parameters<typeof calculateOVR>[0]);
}

function applyMultiplier(rawAttrs: Record<string, number | null>, m: number): Record<string, number | null> {
  const result: Record<string, number | null> = { ...rawAttrs };
  for (const attr of SCALE_ATTRS) {
    const val = result[attr];
    if (typeof val !== "number") continue;
    const minV = COMMON_ATTRS.has(attr) ? 10 : 20;
    result[attr] = Math.max(minV, Math.round(val * m));
  }
  return result;
}

function findMultiplier(
  rawAttrs: Record<string, number | null>,
  abilities: string[],
  position: string,
  firstName: string,
  lastName: string,
  teamName: string,
  conference: string,
  targetOVR: number,
): { m: number; resultOVR: number; newAttrs: Record<string, number | null> } {
  let lo = 0.2, hi = 1.0;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const scaled = applyMultiplier(rawAttrs, mid);
    const ovr = computeOVR(scaled, abilities, position, firstName, lastName, teamName, conference);
    if (ovr > targetOVR) hi = mid;
    else lo = mid;
  }

  const attrsLo = applyMultiplier(rawAttrs, lo);
  const attrsHi = applyMultiplier(rawAttrs, hi);
  const ovrLo   = computeOVR(attrsLo, abilities, position, firstName, lastName, teamName, conference);
  const ovrHi   = computeOVR(attrsHi, abilities, position, firstName, lastName, teamName, conference);

  let finalM: number, finalOVR: number, finalAttrs: Record<string, number | null>;
  if (Math.abs(ovrLo - targetOVR) <= Math.abs(ovrHi - targetOVR)) {
    finalM = lo; finalOVR = ovrLo; finalAttrs = attrsLo;
  } else {
    finalM = hi; finalOVR = ovrHi; finalAttrs = attrsHi;
  }

  // Fine-tune: if still > 3 above target, try decrementing individual attrs
  // to close the gap without undershooting by more than 3.
  const TUNE_ATTRS = ["hitForAvg","power","speed","arm","fielding","errorResistance",
                      "clutch","vsLHP","grit","stealing","running","throwing"] as const;
  const TOLERANCE = 3;
  let improved = true;
  while (improved && finalOVR - targetOVR > TOLERANCE) {
    improved = false;
    for (const attr of TUNE_ATTRS) {
      const current = finalAttrs[attr];
      if (typeof current !== "number") continue;
      const minV = COMMON_ATTRS.has(attr) ? 10 : 20;
      if (current <= minV) continue;
      const candidate = { ...finalAttrs, [attr]: current - 1 };
      const candidateOVR = computeOVR(candidate, abilities, position, firstName, lastName, teamName, conference);
      // Accept if it gets us closer to target without going more than TOLERANCE below
      if (Math.abs(candidateOVR - targetOVR) < Math.abs(finalOVR - targetOVR)) {
        finalAttrs = candidate;
        finalOVR = candidateOVR;
        improved = true;
        break;
      }
    }
  }

  return { m: finalM, resultOVR: finalOVR, newAttrs: finalAttrs };
}

interface TargetPlayer {
  name: string; firstName: string; lastName: string;
  position: string; team: string; conference: string;
  file: string; lineNum: number;
  targetOVR: number;
  abilities: string[];
  raw: Record<string, number | null>;
}

const targets: TargetPlayer[] = [
  {
    name: "Roch Cholowsky", firstName: "Roch", lastName: "Cholowsky",
    position: "SS", team: "UCLA", conference: "Big Ten",
    file: "server/bigTenBatch3.ts", lineNum: 634,
    targetOVR: 537,
    abilities: ["Power Hitter", "Consigliere", "Tough Out", "Defensive Artisan", "Magician"],
    raw: { hitForAvg:71, power:60, speed:65, arm:68, fielding:75, errorResistance:66,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:59, vsLHP:53, grit:42, stealing:54, running:50, throwing:65,
           recovery:42, wRISP:90, vsLefty:90, poise:90, heater:0, agile:75,
           catcherAbility:null },
  },
  {
    name: "Roman Martin", firstName: "Roman", lastName: "Martin",
    position: "3B", team: "UCLA", conference: "Big Ten",
    file: "server/bigTenBatch3.ts", lineNum: 650,
    targetOVR: 507,
    abilities: ["Spray Hitter", "Defensive Artisan"],
    raw: { hitForAvg:66, power:64, speed:61, arm:66, fielding:68, errorResistance:64,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:70, vsLHP:63, grit:63, stealing:47, running:47, throwing:75,
           recovery:44, wRISP:70, vsLefty:66, poise:70, heater:0, agile:44,
           catcherAbility:null },
  },
  {
    name: "Hideki Prather", firstName: "Hideki", lastName: "Prather",
    position: "C", team: "California", conference: "Big Ten",
    file: "server/accRostersBatch3.ts", lineNum: 73,
    targetOVR: 503,
    abilities: ["Power Hitter", "Consigliere", "Head-first Slide"],
    raw: { hitForAvg:62, power:61, speed:40, arm:57, fielding:61, errorResistance:52,
           velocity:0, control:0, stamina:20, stuff:0,
           clutch:54, vsLHP:50, grit:50, stealing:38, running:38, throwing:52,
           recovery:43, wRISP:51, vsLefty:48, poise:45, heater:0, agile:36,
           catcherAbility:52 },
  },
  {
    name: "Cade Arrambide", firstName: "Cade", lastName: "Arrambide",
    position: "C", team: "LSU", conference: "SEC",
    file: "server/secBatch1.ts", lineNum: 98,
    targetOVR: 512,
    abilities: ["Power Hitter", "Defensive Artisan", "Consigliere", "Pull Hitter"],
    raw: { hitForAvg:73, power:85, speed:60, arm:73, fielding:74, errorResistance:56,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:78, vsLHP:75, grit:75, stealing:58, running:58, throwing:79,
           recovery:65, wRISP:78, vsLefty:75, poise:78, heater:0, agile:32,
           catcherAbility:76 },
  },
  {
    name: "Will Gasparino", firstName: "Will", lastName: "Gasparino",
    position: "OF", team: "UCLA", conference: "Big Ten",
    file: "server/bigTenBatch3.ts", lineNum: 691,
    targetOVR: 510,
    abilities: ["Power Hitter", "Opposite Field Hitter", "Good Infield Hit"],
    raw: { hitForAvg:78, power:68, speed:60, arm:41, fielding:68, errorResistance:66,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:80, vsLHP:63, grit:41, stealing:47, running:50, throwing:63,
           recovery:41, wRISP:76, vsLefty:68, poise:72, heater:0, agile:56,
           catcherAbility:null },
  },
  {
    name: "Cashel Dugger", firstName: "Cashel", lastName: "Dugger",
    position: "C", team: "UCLA", conference: "Big Ten",
    file: "server/bigTenBatch3.ts", lineNum: 617,
    targetOVR: 510,
    abilities: ["Defensive Artisan", "Revenge", "Consigliere"],
    raw: { hitForAvg:57, power:50, speed:62, arm:70, fielding:66, errorResistance:58,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:63, vsLHP:62, grit:70, stealing:47, running:47, throwing:86,
           recovery:56, wRISP:64, vsLefty:60, poise:68, heater:0, agile:38,
           catcherAbility:70 },
  },
  {
    name: "Mulivai Levu", firstName: "Mulivai", lastName: "Levu",
    position: "1B", team: "UCLA", conference: "Big Ten",
    file: "server/bigTenBatch3.ts", lineNum: 642,
    targetOVR: 505,
    abilities: ["Line Drive", "Power Hitter", "Consigliere"],
    raw: { hitForAvg:67, power:77, speed:65, arm:53, fielding:51, errorResistance:73,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:80, vsLHP:58, grit:63, stealing:47, running:47, throwing:41,
           recovery:41, wRISP:78, vsLefty:68, poise:74, heater:0, agile:32,
           catcherAbility:null },
  },
  {
    name: "Ethan Surowiec", firstName: "Ethan", lastName: "Surowiec",
    position: "OF", team: "Florida", conference: "SEC",
    file: "server/secBatch1.ts", lineNum: 372,
    targetOVR: 502,
    abilities: ["Shock Commander", "vs. Ace", "Power Hitter", "Consigliere"],
    raw: { hitForAvg:64, power:64, speed:68, arm:65, fielding:52, errorResistance:42,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:68, vsLHP:64, grit:68, stealing:51, running:51, throwing:60,
           recovery:42, wRISP:70, vsLefty:64, poise:70, heater:0, agile:38,
           catcherAbility:null },
  },
  {
    name: "Maddox Molony", firstName: "Maddox", lastName: "Molony",
    position: "SS", team: "Oregon", conference: "Big Ten",
    file: "server/bigTenBatch2.ts", lineNum: 791,
    targetOVR: 503,
    abilities: ["Revenge", "Power Hitter", "Defensive Artisan", "Consigliere"],
    raw: { hitForAvg:64, power:64, speed:66, arm:62, fielding:55, errorResistance:47,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:64, vsLHP:58, grit:64, stealing:49, running:49, throwing:70,
           recovery:46, wRISP:64, vsLefty:58, poise:64, heater:0, agile:52,
           catcherAbility:null },
  },
  {
    name: "Drew Burress", firstName: "Drew", lastName: "Burress",
    // Gambler = gold linked to clutch (S_GOLD_COMMON_KEY).
    // clutch after scale (Georgia Tech sf=1.386, hm=0.96): 90*1.386*0.96=~119→capped 89 → A grade.
    // Since not S-grade, Gambler gold scores full +15 pts.
    position: "OF", team: "Georgia Tech", conference: "ACC",
    file: "server/accRostersBatch1.ts", lineNum: 675,
    targetOVR: 500,
    abilities: ["Good Infield Hit", "Consigliere", "Gambler"],
    raw: { hitForAvg:50, power:78, speed:58, arm:50, fielding:65, errorResistance:66,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:90, vsLHP:82, grit:56, stealing:47, running:60, throwing:60,
           recovery:62, wRISP:88, vsLefty:80, poise:84, heater:0, agile:72,
           catcherAbility:null },
  },
  {
    name: "Brendan Lawson", firstName: "Brendan", lastName: "Lawson",
    // "Magician" (gold) removed; already has "Defensive Artisan". Final: 2 abilities.
    // Roster file: remove "Magician", keep ["Defensive Artisan", "Consigliere"].
    position: "SS", team: "Florida", conference: "SEC",
    file: "server/secBatch1.ts", lineNum: 315,
    targetOVR: 499,
    abilities: ["Defensive Artisan", "Consigliere"],
    raw: { hitForAvg:62, power:47, speed:68, arm:62, fielding:65, errorResistance:66,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:84, vsLHP:80, grit:70, stealing:56, running:65, throwing:72,
           recovery:62, wRISP:86, vsLefty:80, poise:86, heater:0, agile:68,
           catcherAbility:null },
  },
  {
    name: "Drew Smith", firstName: "Drew", lastName: "Smith",
    // "Trickster" (gold) → "Pressure Run" (blue). Roster file: replace "Trickster".
    position: "OF", team: "Oregon", conference: "Big Ten",
    file: "server/bigTenBatch2.ts", lineNum: 832,
    targetOVR: 499,
    abilities: ["Pressure Run", "Spray Hitter", "Power Hitter"],
    raw: { hitForAvg:62, power:62, speed:66, arm:65, fielding:58, errorResistance:40,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:64, vsLHP:60, grit:64, stealing:49, running:50, throwing:66,
           recovery:46, wRISP:64, vsLefty:60, poise:64, heater:0, agile:52,
           catcherAbility:null },
  },
  {
    name: "Daniel Jackson", firstName: "Daniel", lastName: "Jackson",
    position: "C", team: "Georgia", conference: "SEC",
    file: "server/secBatch2.ts", lineNum: 729,
    targetOVR: 497,
    abilities: ["Spray Hitter", "Consigliere", "Storming Home", "Power Hitter", "Unpredictable"],
    raw: { hitForAvg:65, power:62, speed:60, arm:52, fielding:48, errorResistance:39,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:90, vsLHP:82, grit:48, stealing:52, running:55, throwing:53,
           recovery:60, wRISP:86, vsLefty:80, poise:84, heater:0, agile:60,
           catcherAbility:70 },
  },
  {
    name: "Tre Phelps", firstName: "Tre", lastName: "Phelps",
    position: "OF", team: "Georgia", conference: "SEC",
    file: "server/secBatch2.ts", lineNum: 795,
    targetOVR: 495,
    abilities: ["Power Hitter", "Consigliere", "Spray Hitter"],
    raw: { hitForAvg:69, power:59, speed:65, arm:61, fielding:54, errorResistance:41,
           velocity:0, control:0, stamina:0, stuff:0,
           clutch:78, vsLHP:66, grit:76, stealing:49, running:50, throwing:66,
           recovery:54, wRISP:78, vsLefty:72, poise:78, heater:0, agile:54,
           catcherAbility:null },
  },
];

// Detect if any ability is gold
function hasGold(abilities: string[]): boolean {
  return abilities.some(n => getAbilityByName(n)?.tier === "gold");
}

console.log("\n=== Player OVR Reduction Results ===\n");
console.log(
  "Player".padEnd(20),
  "Team".padEnd(14),
  "CurOVR".padStart(7),
  "TgtOVR".padStart(7),
  "Mult".padStart(7),
  "ResOVR".padStart(7),
  "Delta".padStart(6),
);
console.log("-".repeat(75));

for (const t of targets) {
  const currentOVR = computeOVR(t.raw, t.abilities, t.position, t.firstName, t.lastName, t.team, t.conference);
  const goldFlag = hasGold(t.abilities) && t.targetOVR < 500 ? " ⚠GOLD" : "";

  const { m, resultOVR, newAttrs } = findMultiplier(
    t.raw, t.abilities, t.position, t.firstName, t.lastName, t.team, t.conference, t.targetOVR,
  );

  const delta = resultOVR - t.targetOVR;
  const deltaStr = (delta >= 0 ? "+" : "") + delta;

  console.log(
    t.name.padEnd(20),
    t.team.padEnd(14),
    String(currentOVR).padStart(7),
    String(t.targetOVR).padStart(7),
    m.toFixed(4).padStart(7),
    String(resultOVR).padStart(7),
    deltaStr.padStart(6) + goldFlag,
  );

  const hKey = ["hitForAvg","power","speed","arm","fielding","errorResistance"];
  const cKey = ["clutch","vsLHP","grit","stealing","running","throwing","recovery","wRISP","vsLefty","poise","agile"];
  const hStr = hKey.map(k => `${k}:${newAttrs[k]}`).join(", ");
  const cStr = cKey.map(k => `${k}:${newAttrs[k]}`).join(", ");
  console.log(`  PRIMARY : ${hStr}`);
  console.log(`  COMMON  : ${cStr}`);
  if (t.raw.catcherAbility !== null && t.raw.catcherAbility !== undefined) {
    console.log(`  catcherAbility: ${newAttrs.catcherAbility}`);
  }
  console.log();
}

console.log("\nNotes:");
console.log("  ⚠GOLD = target < 500 AND player has a gold ability.");
console.log("  When OVR dips below 500, enforceGoldOvrGate replaces gold with a random");
console.log("  blue (-9 pts avg). ResOVR shown is pre-gate (with gold); actual in-game");
console.log("  OVR will be ~9 lower. For exact 499, use gold-stripped attrs.");
