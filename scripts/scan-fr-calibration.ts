import { SEC_BATCH1_ROSTERS } from '../server/secBatch1';
import { SEC_BATCH2_ROSTERS } from '../server/secBatch2';
import { SEC_BATCH3_ROSTERS } from '../server/secBatch3';
import { ACC_BATCH1_ROSTERS } from '../server/accRostersBatch1';
import { ACC_BATCH2_ROSTERS } from '../server/accRostersBatch2';
import { ACC_BATCH3_ROSTERS } from '../server/accRostersBatch3';
import { BIG_TEN_BATCH1_ROSTERS } from '../server/bigTenBatch1';
import { BIG_TEN_BATCH2_ROSTERS } from '../server/bigTenBatch2';
import { BIG_TEN_BATCH3_ROSTERS } from '../server/bigTenBatch3';
import { BIG_12_ROSTERS } from '../server/big12Rosters';

const allRosters = {
  ...SEC_BATCH1_ROSTERS, ...SEC_BATCH2_ROSTERS, ...SEC_BATCH3_ROSTERS,
  ...ACC_BATCH1_ROSTERS, ...ACC_BATCH2_ROSTERS, ...ACC_BATCH3_ROSTERS,
  ...BIG_TEN_BATCH1_ROSTERS, ...BIG_TEN_BATCH2_ROSTERS, ...BIG_TEN_BATCH3_ROSTERS,
  ...BIG_12_ROSTERS
} as Record<string, any[]>;

const highPotentials = ['A+', 'A'];
const results: any[] = [];

for (const [team, players] of Object.entries(allRosters)) {
  for (const p of players) {
    if (p.eligibility !== 'FR') continue;
    if (!highPotentials.includes(p.potential)) continue;
    
    const isPitcher = p.position === 'P';
    const mainStat = isPitcher ? p.velocity : p.hitForAvg;
    
    results.push({
      team, name: `${p.firstName} ${p.lastName}`, pos: p.position,
      potential: p.potential,
      vel: isPitcher ? p.velocity : null,
      stf: isPitcher ? p.stuff : null,
      hit: !isPitcher ? p.hitForAvg : null,
      pwr: !isPitcher ? p.power : null,
      abilities: (p.abilities || []).join(','),
      mainStat
    });
  }
}

results.sort((a, b) => a.team.localeCompare(b.team) || b.mainStat - a.mainStat);

const threshold = (r: any) => r.vel !== null ? 58 : 60;
const underperformers = results.filter(r => r.mainStat < threshold(r));
const good = results.filter(r => r.mainStat >= threshold(r));

console.log(`\n=== NEEDS CALIBRATION (${underperformers.length}) ===`);
underperformers.forEach(r => {
  if (r.vel !== null) {
    console.log(`[${r.team}] ${r.name} (${r.pos}, ${r.potential}): vel=${r.vel}, stf=${r.stf} | ${r.abilities}`);
  } else {
    console.log(`[${r.team}] ${r.name} (${r.pos}, ${r.potential}): hit=${r.hit}, pwr=${r.pwr} | ${r.abilities}`);
  }
});

console.log(`\n=== ALREADY GOOD (${good.length}) ===`);
good.forEach(r => {
  if (r.vel !== null) {
    console.log(`[${r.team}] ${r.name} (${r.pos}, ${r.potential}): vel=${r.vel}, stf=${r.stf} ✓`);
  } else {
    console.log(`[${r.team}] ${r.name} (${r.pos}, ${r.potential}): hit=${r.hit}, pwr=${r.pwr} ✓`);
  }
});
