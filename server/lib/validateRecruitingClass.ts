/**
 * validateAndNormalizeRecruitingClass
 *
 * Central validator for all recruiting class data entering the system.
 * Used by every path that creates or applies a saved class:
 *   - POST /api/saved-recruiting-classes  (save from wizard)
 *   - PATCH /api/saved-recruiting-classes/:id  (update saved class)
 *   - POST /api/import-class/:token  (share import)
 *   - POST /api/leagues/:id/recruiting/save-wizard-class  (in-league wizard save)
 *   - POST /api/leagues/:id/recruiting/load-saved-class  (commissioner load)
 *   - POST /api/leagues/:id/load-recruiting-class  (commissioner load)
 *   - POST /api/leagues/:id/start  (dynasty start with custom class)
 *   - Season-advance class replacement (advance route)
 *
 * Accepts both legacy array format and new { recruits: [...] } format.
 * Returns a clean recruit array ready for batchCreateRecruits() insertion.
 */

import { calculateOVR, getStarRatingFromOVR } from "../../shared/abilities";

// ── Error type ──────────────────────────────────────────────────────────────

export class ClassValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassValidationError";
  }
}

// ── Result type ─────────────────────────────────────────────────────────────

export interface ClassValidationResult {
  /** Normalized, insertion-ready recruit objects (leagueId NOT set — caller adds it). */
  recruits: Record<string, unknown>[];
  /** Non-fatal issues (skipped rows, OVR fallbacks, count mismatches). */
  warnings: string[];
  /** Number of valid recruits returned. */
  recruitCount: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_POSITIONS = new Set(["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"]);
const VALID_RECRUIT_TYPES = new Set(["HS", "JUCO", "TRANSFER"]);
const VALID_HANDS = new Set(["R", "L", "S"]);
const VALID_ELIGIBILITIES = new Set(["FR", "SO", "JR", "SR"]);

/** Fields the DB generates or the caller controls — always stripped from input. */
const STRIP_FIELDS = new Set(["id", "leagueId", "signedTeamId"]);

/** Fields reset to safe defaults on every load so template state never bleeds into live leagues. */
const RESET_ON_LOAD: Record<string, unknown> = {
  stage: "open",
  gemBustRevealed: false,
  signingDayRevealed: false,
};

const NUMERIC_ATTRS: ReadonlyArray<string> = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "clutch", "vsLHP", "grit", "stealing", "running", "throwing", "recovery", "catcherAbility",
  "velocity", "control", "stamina", "stuff", "wRISP", "vsLefty", "poise", "heater", "agile",
];

const PITCH_FIELDS: ReadonlyArray<string> = [
  "pitchFB", "pitch2S", "pitchSL", "pitchCB", "pitchCH", "pitchCT",
  "pitchSNK", "pitchSPL", "pitchSHU", "pitchCCH", "pitchHSL", "pitchSWP",
  "pitchKN", "pitchVSL", "pitchSFF", "pitchFK", "pitchSCB", "pitchPCB",
];

const BOOL_FIELDS: ReadonlyArray<string> = [
  "isBlueChip", "isGem", "isBust", "isGenerationalGem", "isGenerationalBust", "eyeBlack",
];

const APPEARANCE_DEFAULTS: Record<string, string> = {
  skinTone: "light",
  hairColor: "brown",
  hairStyle: "short",
  facialHair: "none",
  eyeStyle: "standard",
  eyebrowStyle: "flat",
  mouthStyle: "neutral",
  headwear: "cap",
};

// ── Coercion helpers ─────────────────────────────────────────────────────────

function coerceBool(val: unknown, def: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (val === 1 || val === "1" || val === "true") return true;
  if (val === 0 || val === "0" || val === "false" || val === null || val === undefined) return false;
  return def;
}

function coerceInt(val: unknown, def: number): number {
  if (typeof val === "number" && Number.isFinite(val)) return Math.round(val);
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    if (!isNaN(n)) return n;
  }
  return def;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * @param raw          Any value from a client request or DB read.
 * @param options
 *   recalculateOvr   Re-derive overall and starRating from attributes using
 *                    calculateOVR(). Defaults to true. Set false only when
 *                    attributes are not yet present (e.g. preview-only paths).
 *   requireCount     Emit a warning when actual count differs from this value.
 */
export function validateAndNormalizeRecruitingClass(
  raw: unknown,
  options: { recalculateOvr?: boolean; requireCount?: number } = {}
): ClassValidationResult {
  const { recalculateOvr = true, requireCount } = options;
  const warnings: string[] = [];

  // 1. Normalize to a candidate array — accept legacy array or { recruits: [...] }
  let candidates: unknown[];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (
    raw !== null &&
    typeof raw === "object" &&
    Array.isArray((raw as Record<string, unknown>).recruits)
  ) {
    candidates = (raw as Record<string, unknown>).recruits as unknown[];
  } else {
    throw new ClassValidationError(
      "Class data must be a recruit array or an object with a 'recruits' array."
    );
  }

  if (candidates.length === 0) {
    throw new ClassValidationError("The recruiting class contains no recruits.");
  }

  // 2. Validate and normalize each row
  const recruits: Record<string, unknown>[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      warnings.push(`Row ${i + 1}: not a recruit object — skipped.`);
      continue;
    }
    const src = r as Record<string, unknown>;

    // ── Required string fields ──
    const firstName = typeof src.firstName === "string" ? src.firstName.trim() : "";
    const lastName  = typeof src.lastName  === "string" ? src.lastName.trim()  : "";
    if (!firstName || !lastName) {
      warnings.push(`Row ${i + 1}: missing firstName or lastName — skipped.`);
      continue;
    }

    const rawPos = typeof src.position === "string" ? src.position.trim().toUpperCase() : "";
    if (!VALID_POSITIONS.has(rawPos)) {
      warnings.push(
        `Row ${i + 1} (${firstName} ${lastName}): invalid position "${src.position}" — skipped.`
      );
      continue;
    }

    // ── Build clean output object — strip unsafe fields first ──
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!STRIP_FIELDS.has(k)) out[k] = v;
    }

    // ── Normalized required strings ──
    out.firstName = firstName;
    out.lastName  = lastName;
    out.position  = rawPos;

    out.homeState = typeof src.homeState === "string" && src.homeState.trim()
      ? src.homeState.trim() : "TX";
    out.hometown  = typeof src.hometown  === "string" && src.hometown.trim()
      ? src.hometown.trim()  : "Unknown";

    const throwHand = typeof src.throwHand === "string"
      ? src.throwHand.toUpperCase() : "R";
    out.throwHand = VALID_HANDS.has(throwHand) ? throwHand : "R";

    const batHand = typeof src.batHand === "string"
      ? src.batHand.toUpperCase() : "R";
    out.batHand = VALID_HANDS.has(batHand) ? batHand : "R";

    const rawType = typeof src.recruitType === "string"
      ? src.recruitType.toUpperCase() : "HS";
    out.recruitType = VALID_RECRUIT_TYPES.has(rawType) ? rawType : "HS";

    const rawYear = typeof src.recruitYear === "string"
      ? src.recruitYear.toUpperCase() : "FR";
    out.recruitYear = VALID_ELIGIBILITIES.has(rawYear) ? rawYear : "FR";

    // ── Numeric rank fields (required NOT NULL, safe to default) ──
    out.classRank    = coerceInt(src.classRank,    i + 1);
    out.positionRank = coerceInt(src.positionRank, 1);
    out.starRank     = coerceInt(src.starRank,     3);
    out.trajectory   = coerceInt(src.trajectory,   2);

    // ── Numeric attributes (default 50 if present-but-invalid, keep absent as absent) ──
    for (const attr of NUMERIC_ATTRS) {
      if (attr in src) {
        out[attr] = coerceInt(src[attr], 50);
      }
    }

    // ── Pitch mix (keep only if present in source — pitchFB defaults to 1) ──
    for (const p of PITCH_FIELDS) {
      if (p in src) {
        out[p] = coerceInt(src[p], p === "pitchFB" ? 1 : 0);
      }
    }

    // ── JSON array fields ──
    out.abilities = Array.isArray(src.abilities)
      ? (src.abilities as unknown[]).filter((a) => typeof a === "string")
      : [];
    out.tools = Array.isArray(src.tools)
      ? (src.tools as unknown[]).filter((a) => typeof a === "string")
      : [];
    out.scoutingOrder = Array.isArray(src.scoutingOrder)
      ? (src.scoutingOrder as unknown[]).filter((a) => typeof a === "string")
      : [];
    out.storyLockedAbilities = Array.isArray(src.storyLockedAbilities)
      ? (src.storyLockedAbilities as unknown[]).filter((a) => typeof a === "string")
      : [];

    // ── Boolean fields — normalize 0/1/null/"true" to actual boolean ──
    for (const field of BOOL_FIELDS) {
      out[field] = coerceBool(src[field], false);
    }

    // ── Reset fields that must not carry over from a template into a live league ──
    Object.assign(out, RESET_ON_LOAD);

    // ── Clamped numeric fields ──
    out.commitmentThreshold = Math.max(0, Math.min(1000, coerceInt(src.commitmentThreshold, 500)));
    out.nilCost             = Math.max(0, coerceInt(src.nilCost, 0));
    out.workEthicScore      = Math.max(1, Math.min(100, coerceInt(src.workEthicScore, 70)));
    out.coachability        = Math.max(1, Math.min(100, coerceInt(src.coachability, 70)));

    // ── Optional nullable numeric fields ──
    for (const f of ["potential", "potentialFloor", "potentialCeiling", "originPrestige"]) {
      if (src[f] !== undefined && src[f] !== null) {
        out[f] = coerceInt(src[f], 0);
      } else {
        out[f] = null;
      }
    }

    // ── Appearance string fields — keep stored value or fall back to default ──
    for (const [field, def] of Object.entries(APPEARANCE_DEFAULTS)) {
      out[field] = typeof src[field] === "string" && (src[field] as string).trim()
        ? (src[field] as string).trim()
        : def;
    }

    // ── playerArchetype ──
    out.playerArchetype = typeof src.playerArchetype === "string" && src.playerArchetype.trim()
      ? src.playerArchetype.trim()
      : "normal";

    // ── personality / workEthic (optional) ──
    if (typeof src.personality === "string") out.personality = src.personality;
    if (typeof src.workEthic   === "string") out.workEthic   = src.workEthic;

    // ── fromTeamName / classVintage (optional strings) ──
    if (typeof src.fromTeamName  === "string") out.fromTeamName  = src.fromTeamName;
    if (typeof src.classVintage  === "string") out.classVintage  = src.classVintage;

    // ── OVR and starRating ──
    if (recalculateOvr) {
      try {
        const computed = calculateOVR(out as Parameters<typeof calculateOVR>[0]);
        const stored   = coerceInt(src.overall, 300);
        if (Math.abs(computed - stored) > 30) {
          warnings.push(
            `Row ${i + 1} (${firstName} ${lastName}): OVR recalculated ${stored} → ${computed} (${computed > stored ? "+" : ""}${computed - stored}).`
          );
        }
        out.overall    = computed;
        out.starRating = getStarRatingFromOVR(computed);
      } catch {
        // Fall back to stored values — calculateOVR should never throw but be safe
        out.overall    = coerceInt(src.overall, 300);
        out.starRating = coerceInt(src.starRating, 3);
        warnings.push(
          `Row ${i + 1} (${firstName} ${lastName}): OVR recalculation failed, using stored value ${out.overall}.`
        );
      }
    } else {
      out.overall    = coerceInt(src.overall, 300);
      out.starRating = coerceInt(src.starRating, 3);
    }

    recruits.push(out);
  }

  if (recruits.length === 0) {
    throw new ClassValidationError(
      `No valid recruits after validation (${candidates.length - recruits.length} rows skipped). ` +
      `Warnings: ${warnings.slice(0, 3).join("; ")}${warnings.length > 3 ? " …" : ""}`
    );
  }

  if (requireCount !== undefined && recruits.length !== requireCount) {
    warnings.push(
      `Recruit count mismatch: expected ${requireCount}, got ${recruits.length}.`
    );
  }

  return { recruits, warnings, recruitCount: recruits.length };
}
