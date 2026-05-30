import { calculateOVR } from "../shared/abilities";
import { ALL_REAL_ROSTERS } from "../server/realRosters";

const targets: Record<string, number> = {
  "Vahn Lackey": 530,
  "Ryder Helfrick": 520,
  "Drew Burress": 540,
  "Zion Rose": 475,
  "Roch Cholowsky": 550,
  "Justin Lebron": 540,
  "Brendan Lawson": 515,
  "Brody Donay": 505,
  "Jay Abernathy": 495,
};

type Player = Record<string, any>;

// Numeric hitter attrs we can tune
const TUNE_ATTRS = ["hitForAvg","power","speed","arm","fielding","errorResistance","clutch","vsLHP","grit","stealing","running","throwing","catcherAbility"] as const;

function findBest(base: Player, target: number): {attrs: Partial<Record<string,number>>, ovr: number} {
  const current = calculateOVR(base as any);
  const delta = target - current;
  
  // Strategy: adjust hitForAvg and power first, then secondary attrs if needed
  let best: {attrs: Partial<Record<string,number>>, ovr: number} = {attrs: {}, ovr: current};
  let bestDiff = Math.abs(current - target);
  
  // Try adjusting hitForAvg and power in range -40..+40
  for (let dH = -50; dH <= 50; dH++) {
    for (let dP = -50; dP <= 50; dP++) {
      const h = Math.max(1, Math.min(99, (base.hitForAvg ?? 50) + dH));
      const pw = Math.max(1, Math.min(99, (base.power ?? 50) + dP));
      const p = {...base, hitForAvg: h, power: pw};
      const ovr = calculateOVR(p as any);
      const diff = Math.abs(ovr - target);
      const magnitude = Math.abs(dH) + Math.abs(dP);
      if (diff < bestDiff || (diff === bestDiff && magnitude < Object.values(best.attrs).reduce((a,b) => a+Math.abs(b??0),0))) {
        bestDiff = diff;
        best = {attrs: {hitForAvg: h, power: pw}, ovr};
      }
    }
  }
  
  return best;
}

for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players as Player[]) {
    const name = `${p.firstName} ${p.lastName}`;
    if (targets[name] !== undefined) {
      const target = targets[name];
      const current = calculateOVR(p as any);
      const result = findBest(p, target);
      console.log(`\n${name}: current=${current}, target=${target}`);
      console.log(`  Suggested: hitForAvg=${result.attrs.hitForAvg ?? p.hitForAvg}, power=${result.attrs.power ?? p.power} → OVR=${result.ovr} (diff=${result.ovr - target})`);
      console.log(`  Current: hitForAvg=${p.hitForAvg}, power=${p.power}`);
    }
  }
}
