/**
 * normalizeCommonAbilities
 *
 * Returns a plain object containing ONLY the common ability fields, with any
 * F/G-grade values (< 50) boosted as needed so the total F/G count stays within
 * the tier-adjusted target.  Seed fields (firstName, lastName, position) are
 * never present in the returned object, preventing them from accidentally being
 * spread into player/recruit payloads.
 *
 * Common ability field sets:
 *   - Pitchers  : wRISP, vsLefty, poise, grit, heater, agile, recovery
 *   - Fielders  : clutch, vsLHP, grit, stealing, running, throwing, recovery
 *   - Catchers  : fielder set + catcherAbility
 *
 * Primary attributes (hitForAvg, power, velocity, control, etc.) are never touched.
 */

export const CONFERENCE_TIERS: Record<string, number> = {
  SEC: 1, ACC: 1, "Big Ten": 1, "Big 12": 1,
  "Pac-12": 2, AAC: 2, "Sun Belt": 2,
  WCC: 3, "Big West": 3, "Missouri Valley": 3,
  "Ivy League": 4,
  HBCU: 5,
};

/**
 * Weighted distribution of max-allowed F/G count for Tier 1.
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

const PITCHER_FIELDS = ["wRISP", "vsLefty", "poise", "grit", "heater", "agile", "recovery"] as const;
const FIELDER_FIELDS = ["clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery"] as const;
const CATCHER_FIELDS = [...FIELDER_FIELDS, "catcherAbility"] as const;

export type PitcherCommonKey = typeof PITCHER_FIELDS[number];
export type FielderCommonKey = typeof FIELDER_FIELDS[number];
export type CatcherCommonKey = typeof CATCHER_FIELDS[number];
export type CommonAbilityKey = PitcherCommonKey | CatcherCommonKey;

/** All unique common-ability field names — exported for migration/validation consumers. */
export const ALL_COMMON_FIELDS = Array.from(
  new Set([...PITCHER_FIELDS, ...CATCHER_FIELDS]),
) as readonly string[];

/** Minimal input contract: only the fields the normalizer reads. */
export interface NormalizerInput {
  position: string;
  firstName?: string;
  lastName?: string;
  wRISP?: number | null;
  vsLefty?: number | null;
  poise?: number | null;
  grit?: number | null;
  heater?: number | null;
  agile?: number | null;
  recovery?: number | null;
  clutch?: number | null;
  vsLHP?: number | null;
  stealing?: number | null;
  running?: number | null;
  throwing?: number | null;
  catcherAbility?: number | null;
}

/** The return type: ONLY common ability fields — never seed or identity fields. */
export type NormalizerOutput = {
  [K in CommonAbilityKey]?: number | null;
};

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
 * Tier shift is capped at 2 to prevent over-permissiveness in lower-tier conferences:
 *   Tier 1 → shift 0, Tier 2 → shift 1, Tier 3-5 → shift 2 (max).
 * This keeps HBCU/Ivy players in the 1–3 F/G range rather than 4–9.
 */
function sampleMaxFG(tier: number, seed: number): number {
  const shift = Math.min(2, tier - 1);
  const r = seed % DIST_TOTAL;
  let cumulative = 0;
  for (const [maxFG, weight] of TIER1_DIST) {
    cumulative += weight;
    if (r < cumulative) return maxFG + shift;
  }
  return TIER1_DIST[TIER1_DIST.length - 1][0] + shift;
}

function getCommonFields(position: string): readonly string[] {
  if (["P", "SP", "RP", "CP", "CL"].includes(position)) return PITCHER_FIELDS;
  if (position === "C") return CATCHER_FIELDS;
  return FIELDER_FIELDS;
}

/**
 * Normalizes the common ability F/G distribution for a player.
 *
 * Returns a plain object with ONLY the common ability field keys.
 * The caller merges these onto the player data — seed/identity fields
 * (firstName, lastName, position) are never present in the output.
 */
export function normalizeCommonAbilities(
  player: NormalizerInput,
  conferenceName: string,
): NormalizerOutput {
  const tier = CONFERENCE_TIERS[conferenceName] ?? 1;
  const fields = getCommonFields(player.position);

  const seed = nameHash(
    `${player.firstName ?? ""}${player.lastName ?? ""}${player.position}`,
  );
  const maxFG = sampleMaxFG(tier, seed);

  // Build the initial output from only the relevant common ability fields
  const out: Record<string, number | null> = {};
  for (const f of fields) {
    const v = (player as unknown as Record<string, unknown>)[f];
    out[f] = typeof v === "number" ? v : null;
  }

  // Grit is capped at A-tier (89). S-grade Grit (≥ 90) is unrealistic for any player.
  if (typeof out.grit === "number" && out.grit > 89) out.grit = 89;

  // Count fields whose value is < 50 (F or G grade)
  const subFifty = fields.filter((f) => typeof out[f] === "number" && (out[f] as number) < 50);

  if (subFifty.length <= maxFG) {
    return out as NormalizerOutput; // already within target
  }

  // Sort descending by current value — boost the highest (least-bad) ones first
  const sorted = [...subFifty].sort(
    (a, b) => (out[b] as number) - (out[a] as number),
  );

  const toBoost = subFifty.length - maxFG;

  for (let i = 0; i < toBoost; i++) {
    const field = sorted[i];
    const cur = out[field] as number;
    // G (<30) → land in 50-54; F (30-49) → land in 51-58
    const base = cur < 30 ? 50 : 51;
    const range = cur < 30 ? 5 : 8;
    const fieldSeed = nameHash(
      `${player.firstName ?? ""}${player.lastName ?? ""}${field}${i}`,
    );
    out[field] = base + (fieldSeed % range);
  }

  return out as NormalizerOutput;
}
