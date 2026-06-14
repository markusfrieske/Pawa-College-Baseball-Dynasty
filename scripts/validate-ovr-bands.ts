/**
 * validate-ovr-bands — checks per-band OVR distribution (1-999 scale) WITH abilities included.
 * Reports whether each band is within ±tolerance% of its target.
 * Mean OVR must fall between MEAN_MIN and MEAN_MAX.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";
import { calculateOVR } from "../shared/abilities";

interface Band {
  lo: number;
  hi: number;
  target: number;
  tolerance: number;
}

// Targets reflect post-normalization OVR (normalizeCommonAbilities baked into CALIBRATED_ROSTERS).
// Boosting F/G common abilities shifts the 100-149 band down and 250-349 bands up vs raw attributes.
const BANDS: Band[] = [
  { lo:  50, hi:  99, target:  1, tolerance: 5 },
  { lo: 100, hi: 149, target:  5, tolerance: 8 },
  { lo: 150, hi: 199, target: 18, tolerance: 10 },
  { lo: 200, hi: 249, target: 15, tolerance: 8 },
  { lo: 250, hi: 299, target: 23, tolerance: 10 },
  { lo: 300, hi: 349, target: 20, tolerance: 10 },
  { lo: 350, hi: 399, target:  9, tolerance: 8 },
  { lo: 400, hi: 449, target:  6, tolerance: 6 },
  { lo: 450, hi: 499, target:  4, tolerance: 5 },
  { lo: 500, hi: 549, target:  3, tolerance: 4 },
  { lo: 550, hi: 599, target:  2, tolerance: 3 },
  { lo: 600, hi: 699, target:  2, tolerance: 3 },
  { lo: 700, hi: 999, target:  1, tolerance: 3 },
];

const MEAN_MIN = 265;
const MEAN_MAX = 307;

const counts = new Array(BANDS.length).fill(0);
let total = 0;
let sum = 0;

for (const players of Object.values(ALL_REAL_ROSTERS)) {
  for (const p of players) {
    const ovr = calculateOVR(p as Parameters<typeof calculateOVR>[0]);
    sum += ovr;
    total++;

    for (let i = 0; i < BANDS.length; i++) {
      if (ovr >= BANDS[i].lo && ovr <= BANDS[i].hi) {
        counts[i]++;
        break;
      }
    }
  }
}

const mean = sum / total;
let failures = 0;

console.log(`\n=== PER-BAND OVR DISTRIBUTION (1-999 scale, with abilities) ===`);
console.log(`Total players: ${total}   Mean OVR: ${mean.toFixed(1)}`);
console.log(`Target mean: ${MEAN_MIN}–${MEAN_MAX}\n`);

for (let i = 0; i < BANDS.length; i++) {
  const { lo, hi, target, tolerance } = BANDS[i];
  const pct = (counts[i] / total) * 100;
  const diff = pct - target;
  const ok = Math.abs(diff) <= tolerance;
  const flag = ok ? "✅" : "❌";
  if (!ok) failures++;
  const diffStr = (diff >= 0 ? "+" : "") + diff.toFixed(1);
  console.log(
    `${flag} ${(lo + "-" + hi).padEnd(9)} ${pct.toFixed(1).padStart(5)}%  tgt ${String(target).padStart(2)}%  diff ${diffStr.padStart(5)}%  (tol ±${tolerance}%)`
  );
}

console.log("");
const meanOk = mean >= MEAN_MIN && mean <= MEAN_MAX;
const meanFlag = meanOk ? "✅" : "❌";
if (!meanOk) failures++;
console.log(`${meanFlag} Mean OVR: ${mean.toFixed(1)}  (required ${MEAN_MIN}–${MEAN_MAX})`);

console.log("");
if (failures === 0) {
  console.log("✅ All per-band OVR checks passed.");
  process.exit(0);
} else {
  console.error(`❌ ${failures} per-band OVR check(s) failed.`);
  process.exit(1);
}
