/**
 * buildClassEnvelope
 *
 * Wraps a validated recruit array in the versioned ClassEnvelope format:
 *   { version: 1, source, config?, summary, recruits }
 *
 * Also exports helpers for extracting recruits / summary from any stored
 * classData (legacy raw array, legacy { theme, recruits }, or versioned envelope).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClassSummary {
  recruitCount: number;
  starDist: Record<number, number>;
  posDist: Record<string, number>;
  regionDist: Record<string, number>;
  blueChips: number;
  gems: number;
  busts: number;
  genGems: number;
  genBusts: number;
  avgOvr: number;
  theme: string | null;
}

export interface ClassGeneration {
  /** Seed string used for procedural generation (UUID or user-supplied). */
  seed: string;
  /** Generator version for future reproducibility checks. */
  version: number;
}

export interface ClassEnvelope {
  version: 1;
  source: "wizard" | "import" | "manual";
  config?: Record<string, unknown>;
  summary: ClassSummary;
  recruits: Record<string, unknown>[];
  /** Optional Story Plan — authored arc assignments for cast members. */
  storyPlan?: import("@shared/schema").WizardStoryPlan;
  /** Seeded generation metadata — present for wizard-generated classes. */
  generation?: ClassGeneration;
}

// ── Region mapping ────────────────────────────────────────────────────────────

const STATE_TO_REGION: Record<string, string> = {
  // Southeast
  FL: "Southeast", GA: "Southeast", SC: "Southeast", NC: "Southeast",
  AL: "Southeast", MS: "Southeast", TN: "Southeast", VA: "Southeast",
  AR: "Southeast", LA: "Southeast", WV: "Southeast",
  // Texas / South Central
  TX: "Texas", OK: "Texas",
  // California
  CA: "California",
  // Midwest
  OH: "Midwest", MI: "Midwest", IN: "Midwest", IL: "Midwest",
  WI: "Midwest", MN: "Midwest", MO: "Midwest", IA: "Midwest",
  KS: "Midwest", NE: "Midwest", ND: "Midwest", SD: "Midwest",
  // Northeast
  NY: "Northeast", PA: "Northeast", NJ: "Northeast", MA: "Northeast",
  CT: "Northeast", RI: "Northeast", VT: "Northeast", NH: "Northeast",
  ME: "Northeast", MD: "Northeast", DE: "Northeast", DC: "Northeast",
  // West / Mountain
  WA: "West", OR: "West", ID: "West", MT: "West", WY: "West",
  CO: "West", UT: "West", NV: "West", AZ: "West", NM: "West",
  HI: "West", AK: "West",
  // International / Other
  PR: "Other", GU: "Other",
};

function stateToRegion(state: string | null | undefined): string {
  if (!state) return "Other";
  const abbr = String(state).trim().toUpperCase();
  return STATE_TO_REGION[abbr] ?? "Other";
}

// ── Summary computation ───────────────────────────────────────────────────────

export function computeSummary(
  recruits: Record<string, unknown>[],
  theme: string | null = null
): ClassSummary {
  const starDist: Record<number, number> = {};
  const posDist: Record<string, number> = {};
  const regionDist: Record<string, number> = {};
  let blueChips = 0, gems = 0, busts = 0, genGems = 0, genBusts = 0, ovrSum = 0;

  for (const r of recruits) {
    const star = typeof r.starRating === "number" ? r.starRating : 3;
    starDist[star] = (starDist[star] || 0) + 1;

    const pos = typeof r.position === "string" ? r.position : "?";
    posDist[pos] = (posDist[pos] || 0) + 1;

    const region = stateToRegion(r.homeState as string | null | undefined);
    regionDist[region] = (regionDist[region] || 0) + 1;

    if (r.isBlueChip)        blueChips++;
    if (r.isGem)             gems++;
    if (r.isBust)            busts++;
    if (r.isGenerationalGem) genGems++;
    if (r.isGenerationalBust) genBusts++;
    ovrSum += typeof r.overall === "number" ? r.overall : 0;
  }

  const avgOvr = recruits.length > 0 ? Math.round(ovrSum / recruits.length) : 0;

  return { recruitCount: recruits.length, starDist, posDist, regionDist, blueChips, gems, busts, genGems, genBusts, avgOvr, theme };
}

// ── Envelope builder ─────────────────────────────────────────────────────────

export function buildClassEnvelope(
  recruits: Record<string, unknown>[],
  source: "wizard" | "import" | "manual",
  opts: { config?: Record<string, unknown>; theme?: string | null; generation?: ClassGeneration } = {}
): ClassEnvelope {
  const envelope: ClassEnvelope = {
    version: 1,
    source,
    summary: computeSummary(recruits, opts.theme ?? null),
    recruits,
  };
  if (opts.config) envelope.config = opts.config;
  if (opts.generation) envelope.generation = opts.generation;
  return envelope;
}

// ── Extraction helpers (handle all legacy + versioned formats) ───────────────

/**
 * Extract recruits array from any stored classData format.
 * Handles: raw array, { theme, recruits }, { version:1, ..., recruits }
 */
export function extractRecruits(classData: unknown): Record<string, unknown>[] {
  if (Array.isArray(classData)) return classData as Record<string, unknown>[];
  if (classData !== null && typeof classData === "object") {
    const obj = classData as Record<string, unknown>;
    if (Array.isArray(obj.recruits)) return obj.recruits as Record<string, unknown>[];
  }
  return [];
}

/**
 * Extract the summary from stored classData.
 * Returns null for legacy formats so callers can fall back to computing it.
 */
export function extractSummary(classData: unknown): ClassSummary | null {
  if (classData !== null && typeof classData === "object" && !Array.isArray(classData)) {
    const obj = classData as Record<string, unknown>;
    if (obj.version === 1 && obj.summary && typeof obj.summary === "object") {
      return obj.summary as ClassSummary;
    }
  }
  return null;
}

/**
 * Extract theme from stored classData (any format).
 */
export function extractTheme(classData: unknown): string | null {
  if (classData === null || typeof classData !== "object" || Array.isArray(classData)) return null;
  const obj = classData as Record<string, unknown>;
  // versioned format: theme lives in summary
  if (obj.version === 1) {
    const summary = obj.summary as Record<string, unknown> | undefined;
    return typeof summary?.theme === "string" ? summary.theme : null;
  }
  // legacy { theme, recruits }
  return typeof obj.theme === "string" ? obj.theme : null;
}

/**
 * Detect source from inbound classData sent by the client.
 * - Wizard sends { theme, recruits } → "wizard"
 * - Versioned envelope already has source
 * - Raw array → "manual"
 */
export function detectSource(raw: unknown): { source: "wizard" | "import" | "manual"; theme: string | null; config?: Record<string, unknown> } {
  if (Array.isArray(raw)) {
    return { source: "manual", theme: null };
  }
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Already versioned
    if (obj.version === 1) {
      const src = (obj.source as string) === "wizard" ? "wizard"
        : (obj.source as string) === "import" ? "import"
        : "manual";
      const summary = obj.summary as Record<string, unknown> | undefined;
      const theme = typeof summary?.theme === "string" ? summary.theme : null;
      const config = obj.config ? (obj.config as Record<string, unknown>) : undefined;
      return { source: src, theme, config };
    }
    // Legacy wizard format { theme, recruits }
    if (Array.isArray(obj.recruits)) {
      const theme = typeof obj.theme === "string" ? obj.theme : null;
      return { source: theme ? "wizard" : "manual", theme };
    }
  }
  return { source: "manual", theme: null };
}
