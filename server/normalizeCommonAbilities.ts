/**
 * normalizeCommonAbilities
 *
 * Ensures the number of F/G-grade common ability fields (value < 50) on a player
 * does not exceed the tier-adjusted target. If the player has too many, the
 * highest-valued (least-bad) sub-50 fields are boosted into the 50-58 range.
 *
 * Only common ability fields are ever modified:
 *   - Pitchers  : wRISP, vsLefty, poise, grit, heater, agile, recovery
 *   - Fielders  : clutch, vsLHP, grit, stealing, running, throwing, recovery
 *   - Catchers  : the fielder set + catcherAbility
 *
 * Primary attributes (hitForAvg, power, velocity, control, etc.) are never touched.
 */

const CONFERENCE_TIERS: Record<string, number> = {
  SEC: 1, ACC: 1, "Big Ten": 1, "Big 12": 1,
  "Pac-12": 2, AAC: 2, "Sun Belt": 2,
  WCC: 3, "Mountain West": 3, "Big West": 3, "Missouri Valley": 3,
  "Ivy League": 4,
  HBCU: 5,
};

/**
 * Weighted distribution of max-allowed F/G count for Tier 1.
 * [ maxFGCount, cumulativeWeight ]
 * Distribution: 0→55%, 1→25%, 2→11%, 3→6%, 4→2%, 5+→1%
 */
const TIER1_DIST: [number, number][] = [
  [0, 55],
  [1, 25],
  [2, 11],
  [3, 6],
  [4, 2],
  [5, 1],
];
const DIST_TOTAL = TIER1_DIST.reduce((s, [, w]) => s + w, 0); // 100

/** Simple deterministic hash so the same player always gets the same bucket. */
function nameHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/**
 * Sample the maximum allowed F/G count for this player given their conference tier.
 * Each tier step below Tier 1 shifts the distribution one slot to the right
 * (allows +1 F/G at the margin).
 */
function sampleMaxFG(tier: number, seed: number): number {
  const shift = tier - 1; // 0 for T1, 4 for T5
  const r = seed % DIST_TOTAL;
  let cumulative = 0;
  for (const [maxFG, weight] of TIER1_DIST) {
    cumulative += weight;
    if (r < cumulative) return maxFG + shift;
  }
  return TIER1_DIST[TIER1_DIST.length - 1][0] + shift;
}

const PITCHER_COMMON = ["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] as const;
const FIELDER_COMMON = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery"] as const;

function getCommonFields(position: string): readonly string[] {
  const isPitcher = ["P", "SP", "RP", "CP", "CL"].includes(position);
  if (isPitcher) return PITCHER_COMMON;
  if (position === "C") return [...FIELDER_COMMON, "catcherAbility"];
  return FIELDER_COMMON;
}

export function normalizeCommonAbilities<T extends Record<string, any>>(
  player: T,
  conferenceName: string,
): T {
  const tier = CONFERENCE_TIERS[conferenceName] ?? 1;
  const fields = getCommonFields(player.position as string);

  const seed = nameHash(
    `${player.firstName ?? ""}${player.lastName ?? ""}${player.position ?? ""}`,
  );
  const maxFG = sampleMaxFG(tier, seed);

  // Collect fields whose value is < 50 (F or G grade)
  const subFifty = fields.filter((f) => {
    const v = player[f];
    return typeof v === "number" && v < 50;
  });

  if (subFifty.length <= maxFG) return player; // already fine

  // Sort descending by current value — boost the highest (least-bad) ones first
  const sorted = [...subFifty].sort(
    (a, b) => (player[b] as number) - (player[a] as number),
  );

  const toBoost = subFifty.length - maxFG;
  const result = { ...player };

  for (let i = 0; i < toBoost; i++) {
    const field = sorted[i];
    const cur = result[field] as number;
    // G (<30) → land in 50-54; F (30-49) → land in 51-58
    const base = cur < 30 ? 50 : 51;
    const range = cur < 30 ? 5 : 8;
    const fieldSeed = nameHash(`${player.firstName ?? ""}${player.lastName ?? ""}${field}${i}`);
    result[field] = base + (fieldSeed % range);
  }

  return result;
}
