import { calculateOVR, enforceGoldOvrGate } from "@shared/abilities";
import { RAW_UNCALIBRATED_ROSTERS } from "./server/realRosters";
import { ROSTER_SCALE_FACTORS } from "./server/rosterScaleFactors";

// Replicate buildCalibratedRosters for Cal only
const SCALE = ROSTER_SCALE_FACTORS["California"] ?? 1;
const PITCHER_POSITIONS = new Set(["P","SP","RP","CP"]);
const SCALE_ATTRS = ["hitForAvg","power","speed","arm","fielding","errorResistance","stealing",
  "velocity","control","stamina","stuff","clutch","vsLHP","grit","running","throwing",
  "recovery","wRISP","vsLefty","poise","heater","agile"] as const;
const COMMON_ATTRS_FOR_CLAMP = new Set(["clutch","vsLHP","grit","running","throwing","recovery","wRISP","vsLefty","poise","heater","agile"]);
const PITCHER_ATTRS = new Set(["velocity","control","stamina","stuff"]);
const HITTER_ATTRS = new Set(["hitForAvg","power","speed","arm","fielding","errorResistance","stealing"]);
const PITCHER_COMMON_FLOOR_ATTRS = ["heater","wRISP","vsLefty","agile","recovery","poise"] as const;

function scalePlayer(player: any, factor: number): any {
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  const result = { ...player };
  for (const attr of SCALE_ATTRS) {
    const val = result[attr];
    if (typeof val === "number") {
      const minV = COMMON_ATTRS_FOR_CLAMP.has(attr) ? 10 : 20;
      const sGradeCap = (val <= 90 || factor < 1) ? 89 : 99;
      let scaled = Math.round(Math.max(minV, Math.min(sGradeCap, val * factor)));
      if (isPitcher && (attr === "hitForAvg" || attr === "power")) scaled = Math.min(scaled, 30);
      result[attr] = scaled;
    }
  }
  return result;
}

function applyGlobalAdjustments(player: any): any {
  const isPitcher = PITCHER_POSITIONS.has(player.position);
  const isCatcher = player.position === "C";
  if (!isPitcher && !isCatcher) return player;
  const result = { ...player };
  if (isPitcher) {
    for (const attr of PITCHER_COMMON_FLOOR_ATTRS) {
      const val = result[attr];
      if (typeof val === "number" && val < 40) {
        result[attr] = Math.max(30, Math.round(val * 1.20));
      }
    }
  }
  if (isCatcher) {
    if (typeof result.fielding === "number") result.fielding = Math.min(99, Math.round(result.fielding * 1.15));
    if (typeof result.errorResistance === "number") result.errorResistance = Math.min(99, Math.round(result.errorResistance * 1.15));
    if (typeof result.arm === "number") result.arm = Math.min(99, Math.round(result.arm * 1.10));
    if (typeof result.catcherAbility === "number") result.catcherAbility = Math.min(99, Math.round(result.catcherAbility * 1.20));
  }
  return result;
}

const players = RAW_UNCALIBRATED_ROSTERS["California"] ?? [];
console.log(`Cal scale factor: ${SCALE}`);
console.log(`Players: ${players.length}\n`);

const results = players.map((p: any) => {
  const scaled = applyGlobalAdjustments(scalePlayer(p, SCALE));
  const ovrFull = calculateOVR({ ...scaled });
  const gated = enforceGoldOvrGate(scaled.abilities ?? [], scaled.position, ovrFull);
  const finalScaled = { ...scaled, abilities: gated };
  const ovrFinal = gated !== scaled.abilities ? calculateOVR({ ...finalScaled }) : ovrFull;
  return {
    name: `${p.firstName} ${p.lastName}`,
    pos: p.position,
    ovr: ovrFinal,
    abilities: gated,
    goldStripped: gated.length !== (scaled.abilities ?? []).length,
  };
}).sort((a: any, b: any) => b.ovr - a.ovr);

results.forEach((r: any) => {
  const star = r.ovr >= 500 ? "5★ OVER-500" : r.ovr >= 400 ? "4★        " : "3★        ";
  const stripped = r.goldStripped ? " [gold stripped]" : "";
  console.log(`${star}  ${r.pos}  OVR=${r.ovr}  ${r.name}${stripped}`);
});

const over500 = results.filter((r: any) => r.ovr >= 500);
console.log(`\n=== Over 500: ${over500.length} ===`);
over500.forEach((r: any) => console.log(`  ${r.name}  ${r.pos}  OVR=${r.ovr}  abilities=${JSON.stringify(r.abilities)}`));
