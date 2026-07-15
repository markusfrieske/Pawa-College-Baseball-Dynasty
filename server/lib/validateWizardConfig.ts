/**
 * validateWizardConfig
 *
 * Strict backend validation for recruiting wizard config objects,
 * used by both /api/recruiting/generate-preview and
 * /api/leagues/:id/recruiting/generate-wizard.
 *
 * Returns null when valid, or an object with a non-empty errors array
 * containing human-readable messages suitable for a 400 response body.
 */

// ── Known enums ──────────────────────────────────────────────────────────────

const VALID_THEMES = new Set([
  "high_velocity", "sluggers", "balanced", "top_heavy", "hidden_gems",
  "bust_heavy", "elite_pitching", "raw_talent", "position_players",
  "defense_first", "power_class", "speed_class",
]);

const VALID_REGION_SKEWS = new Set([
  "none", "southeast", "sunbelt", "texas", "california", "northeast", "midwest",
]);

const VALID_OVR_DISTRIBUTIONS = new Set([
  "bell", "top_heavy", "bottom_heavy", "flat",
]);

// ── Result type ───────────────────────────────────────────────────────────────

export interface WizardConfigValidationResult {
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function inRange(v: number, lo: number, hi: number) {
  return v >= lo && v <= hi;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate a raw wizard config object.
 *
 * @returns null when the config is valid, or { errors } with friendly messages.
 */
export function validateWizardConfig(config: unknown): WizardConfigValidationResult | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { errors: ["config must be a plain object"] };
  }
  const c = config as Record<string, unknown>;
  const errors: string[] = [];

  // ── 1. count: integer 20–5000 ────────────────────────────────────────────
  // Upper bound raised from 80 to 5000 to support large full-season league
  // pools (e.g. 149 teams → 1,081 recruits). The wizard UI fetches the
  // league-specific target from /api/recruit-class-target and updates its
  // slider range accordingly; the server simply refuses unreasonable values.
  const rawCount = c.count;
  let effectiveCount = 75; // default used for special-count ceiling checks
  if (rawCount !== undefined && rawCount !== null) {
    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 20 || count > 5000) {
      errors.push(
        `count must be an integer between 20 and 5000 (got ${rawCount})`
      );
    } else {
      effectiveCount = count;
    }
  }

  // ── 2. theme: known recruiting theme ─────────────────────────────────────
  if (c.theme !== undefined && c.theme !== null) {
    if (!VALID_THEMES.has(String(c.theme))) {
      errors.push(
        `theme "${c.theme}" is not a valid recruiting theme. ` +
        `Valid: ${[...VALID_THEMES].sort().join(", ")}`
      );
    }
  }

  // ── 3. starDistribution: all keys present, non-negative, sum = 100 ────────
  if (c.starDistribution !== undefined && c.starDistribution !== null) {
    const sd = c.starDistribution;
    if (typeof sd !== "object" || Array.isArray(sd)) {
      errors.push("starDistribution must be an object");
    } else {
      const obj = sd as Record<string, unknown>;
      const DIST_KEYS = ["blueChip", "five", "four", "three", "two", "one"] as const;
      const vals: Partial<Record<string, number>> = {};
      let anyKeyErr = false;
      for (const k of DIST_KEYS) {
        const raw = obj[k];
        if (raw === undefined || raw === null) {
          errors.push(`starDistribution.${k} is required`);
          anyKeyErr = true;
        } else {
          const v = Number(raw);
          if (!Number.isFinite(v) || v < 0) {
            errors.push(
              `starDistribution.${k} must be a non-negative number (got ${raw})`
            );
            anyKeyErr = true;
          } else {
            vals[k] = v;
          }
        }
      }
      if (!anyKeyErr) {
        const total = Object.values(vals).reduce((a: number, b) => a + (b ?? 0), 0);
        if (Math.abs(total - 100) > 0.5) {
          errors.push(
            `starDistribution values must sum to 100 — ` +
            `blueChip + five + four + three + two + one = ${total}`
          );
        }
      }
    }
  }

  // ── 4. specialCounts: each field 0 ≤ x ≤ effectiveCount ─────────────────
  if (c.specialCounts !== undefined && c.specialCounts !== null) {
    const sc = c.specialCounts;
    if (typeof sc !== "object" || Array.isArray(sc)) {
      errors.push("specialCounts must be an object");
    } else {
      const obj = sc as Record<string, unknown>;
      const SPECIAL_KEYS = [
        "gems", "busts", "genGems", "genBusts", "blueChips",
        "jucos", "rawPlayers", "lateBloomers", "overdrafts",
      ] as const;
      for (const k of SPECIAL_KEYS) {
        const raw = obj[k];
        if (raw === undefined || raw === null) continue; // optional keys
        const v = Number(raw);
        if (!isNonNegInt(v)) {
          errors.push(
            `specialCounts.${k} must be a non-negative integer (got ${raw})`
          );
        } else if (v > effectiveCount) {
          errors.push(
            `specialCounts.${k} (${v}) cannot exceed class size (${effectiveCount})`
          );
        }
      }
    }
  }

  // ── 5. positionDistribution: total weight must be > 0 ────────────────────
  if (c.positionDistribution !== undefined && c.positionDistribution !== null) {
    const pd = c.positionDistribution;
    if (typeof pd !== "object" || Array.isArray(pd)) {
      errors.push("positionDistribution must be an object");
    } else {
      const obj = pd as Record<string, unknown>;
      let hasNegative = false;
      for (const [pos, raw] of Object.entries(obj)) {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0) {
          errors.push(
            `positionDistribution.${pos} must be a non-negative number (got ${raw})`
          );
          hasNegative = true;
        }
      }
      if (!hasNegative) {
        const total = Object.values(obj).reduce(
          (s: number, v) => s + (Number(v) || 0), 0
        );
        if (total <= 0) {
          errors.push(
            "positionDistribution must have at least one position with a positive weight"
          );
        }
      }
    }
  }

  // ── 6. OVR range: min/max/average 150–650, min ≤ avg ≤ max ──────────────
  const hasOvrMin = c.ovrMin !== undefined && c.ovrMin !== null;
  const hasOvrMax = c.ovrMax !== undefined && c.ovrMax !== null;
  const hasOvrAvg = c.ovrAverage !== undefined && c.ovrAverage !== null;

  let ovrMin: number | null = null;
  let ovrMax: number | null = null;
  let ovrAvg: number | null = null;

  if (hasOvrMin) {
    const v = Number(c.ovrMin);
    if (!Number.isInteger(v) || !inRange(v, 150, 650)) {
      errors.push(`ovrMin must be an integer between 150 and 650 (got ${c.ovrMin})`);
    } else {
      ovrMin = v;
    }
  }

  if (hasOvrMax) {
    const v = Number(c.ovrMax);
    if (!Number.isInteger(v) || !inRange(v, 150, 650)) {
      errors.push(`ovrMax must be an integer between 150 and 650 (got ${c.ovrMax})`);
    } else {
      ovrMax = v;
    }
  }

  if (ovrMin !== null && ovrMax !== null && ovrMin > ovrMax) {
    errors.push(`ovrMin (${ovrMin}) must be less than or equal to ovrMax (${ovrMax})`);
  }

  if (hasOvrAvg) {
    const v = Number(c.ovrAverage);
    if (!Number.isInteger(v) || !inRange(v, 150, 650)) {
      errors.push(`ovrAverage must be an integer between 150 and 650 (got ${c.ovrAverage})`);
    } else {
      ovrAvg = v;
      const lo = ovrMin ?? 150;
      const hi = ovrMax ?? 650;
      if (ovrAvg < lo || ovrAvg > hi) {
        errors.push(
          `ovrAverage (${ovrAvg}) must be between ovrMin (${lo}) and ovrMax (${hi})`
        );
      }
    }
  }

  // ── 7. ovrDistribution: known enum ───────────────────────────────────────
  if (c.ovrDistribution !== undefined && c.ovrDistribution !== null) {
    if (!VALID_OVR_DISTRIBUTIONS.has(String(c.ovrDistribution))) {
      errors.push(
        `ovrDistribution "${c.ovrDistribution}" is not valid. ` +
        `Valid: bell, top_heavy, bottom_heavy, flat`
      );
    }
  }

  // ── 8. regionSkew: known enum ─────────────────────────────────────────────
  if (c.regionSkew !== undefined && c.regionSkew !== null) {
    if (!VALID_REGION_SKEWS.has(String(c.regionSkew))) {
      errors.push(
        `regionSkew "${c.regionSkew}" is not valid. ` +
        `Valid: ${[...VALID_REGION_SKEWS].sort().join(", ")}`
      );
    }
  }

  return errors.length > 0 ? { errors } : null;
}
