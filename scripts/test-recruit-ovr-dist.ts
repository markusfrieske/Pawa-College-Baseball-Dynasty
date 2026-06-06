import { generateRecruitClass } from "../server/recruit-generator";

async function testRecruitOvr() {
  const RUNS = 8;
  const COUNT = 80;
  
  const tierBands: Record<string, [number, number]> = {
    "1★": [150, 199], "2★": [200, 299], "3★": [300, 399],
    "4★": [400, 499], "5★": [500, 539], "BC": [540, 599],
    "genGem": [600, 650], "genBust": [150, 199],
    "gem1": [300, 399], "gem2": [400, 499], "gem3": [500, 539], "gem4": [540, 599],
    "bust3": [150, 199], "bust4": [200, 299], "bust5": [300, 399],
  };
  
  const stats: Record<string, { total: number; inBand: number; below: number; above: number; ovrs: number[] }> = {};
  const init = (k: string) => { if (!stats[k]) stats[k] = { total: 0, inBand: 0, below: 0, above: 0, ovrs: [] }; };
  
  for (let run = 0; run < RUNS; run++) {
    const recruits = generateRecruitClass(COUNT, `test-league-${run}`, 1);
    
    for (const r of recruits) {
      const ovr = r.overall;
      const star = r.starRating;
      const isBc = (r as any).isBlueChip;
      const isGem = (r as any).isGem;
      const isBust = (r as any).isBust;
      const isGenGem = (r as any).isGenerationalGem;
      const isGenBust = (r as any).isGenerationalBust;
      
      let key: string;
      if (isGenGem) key = "genGem";
      else if (isGenBust) key = "genBust";
      else if (isBc) key = "BC";
      else if (isGem) key = `gem${star}`;
      else if (isBust) key = `bust${star}`;
      else key = `${star}★`;
      
      init(key);
      stats[key].total++;
      stats[key].ovrs.push(ovr);
      const [lo, hi] = tierBands[key] ?? [150, 650];
      if (ovr >= lo && ovr <= hi) stats[key].inBand++;
      else if (ovr < lo) stats[key].below++;
      else stats[key].above++;
    }
  }
  
  console.log("\n=== RECRUIT OVR DISTRIBUTION (" + RUNS + " classes × " + COUNT + " recruits) ===\n");
  const keyOrder = ["1★","2★","3★","4★","5★","BC","genGem","genBust","gem1","gem2","gem3","gem4","bust3","bust4","bust5"];
  let allPass = true;
  for (const key of keyOrder) {
    const s = stats[key];
    if (!s || s.total === 0) continue;
    const pct = (n: number) => ((n / s.total) * 100).toFixed(1);
    const avg = Math.round(s.ovrs.reduce((a, b) => a + b, 0) / s.total);
    const mn = Math.min(...s.ovrs), mx = Math.max(...s.ovrs);
    const [lo, hi] = tierBands[key] ?? [150, 650];
    const rate = s.inBand / s.total;
    const pass = rate >= 0.80 ? "✅" : rate >= 0.60 ? "⚠ " : "❌";
    if (rate < 0.80) allPass = false;
    console.log(`${pass} ${key.padEnd(8)} n=${String(s.total).padStart(4)} | in-band=${pct(s.inBand).padStart(5)}% | below=${pct(s.below).padStart(5)}% | above=${pct(s.above).padStart(5)}% | avg=${avg} range=[${mn},${mx}] target=[${lo},${hi}]`);
  }
  console.log(allPass ? "\n✅ All tiers ≥80% in-band" : "\n⚠  Some tiers below 80% threshold — check calibration");
}

testRecruitOvr().catch(console.error);
