import { generateRecruitClass, type RecruitingTheme } from "../server/recruit-generator";
import { ALL_ABILITIES, getAbilitiesForPosition } from "../shared/abilities";

interface ValidationIssue {
  scope: string;
  severity: "error" | "warning";
  message: string;
}

const CANONICAL_ABILITY_NAMES = new Set(ALL_ABILITIES.map(a => a.name));
const OUTFIELD_POSITIONS = new Set(["OF", "LF", "CF", "RF"]);

const CLASS_SIZE = 80;

// Number of randomized trials per theme. Distribution checks aggregate across
// trials to keep tolerances stable.
const TRIALS_PER_THEME = 30;

interface DistributionTolerance {
  // Inclusive expected band for percentage of recruits that should fall into
  // this star bucket across the aggregated sample. Targets come from
  // replit.md ("Blue Chip 5★ ~3%, 5★ ~5%, 4★ ~12%, 3★ ~60%, 2★ ~15%, 1★ ~5%").
  // Tolerances are deliberately generous because the underlying generator
  // uses fixed index thresholds rather than per-recruit rolls.
  star: 1 | 2 | 3 | 4 | 5;
  minPct: number;
  maxPct: number;
}

const STANDARD_DISTRIBUTION: DistributionTolerance[] = [
  { star: 5, minPct: 0.05, maxPct: 0.12 },
  { star: 4, minPct: 0.08, maxPct: 0.16 },
  { star: 3, minPct: 0.55, maxPct: 0.65 },
  { star: 2, minPct: 0.10, maxPct: 0.20 },
  { star: 1, minPct: 0.02, maxPct: 0.10 },
];

function validatePerClassInvariants(
  classes: ReturnType<typeof generateRecruitClass>[],
  scopeLabel: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  classes.forEach((recruits, classIdx) => {
    const scope = `${scopeLabel} class #${classIdx + 1}`;

    // 1. Size
    if (recruits.length !== CLASS_SIZE) {
      issues.push({
        scope,
        severity: "error",
        message: `expected ${CLASS_SIZE} recruits, got ${recruits.length}`,
      });
    }

    // 2. Gen gem count = 1, gen bust count = 1 (spec: exactly 1 each per class)
    const gems = recruits.filter((r) => r.isGenerationalGem);
    const busts = recruits.filter((r) => r.isGenerationalBust);
    if (gems.length !== 1) {
      issues.push({
        scope,
        severity: "error",
        message: `expected exactly 1 generational gem, got ${gems.length}`,
      });
    }
    if (busts.length !== 1) {
      issues.push({
        scope,
        severity: "error",
        message: `expected exactly 1 generational bust, got ${busts.length}`,
      });
    }

    // Generational gems always produce OVR 600-650 regardless of displayed star rank.
    // Generational busts always produce OVR 150-199 regardless of displayed star rank.
    // (recruit-generator.ts clamps: genGem → Math.max(600, Math.min(650, overall)),
    //                                genBust → Math.max(150, Math.min(199, overall)))
    const GEN_GEM_OVR: Record<number, [number, number]> = { 1: [600, 650], 2: [600, 650], 3: [600, 650] };
    const GEN_BUST_OVR: Record<number, [number, number]> = { 3: [150, 199], 4: [150, 199], 5: [150, 199] };

    // 3. Generational gem invariants: 5-7 abilities, star-relative OVR, never blue chip
    for (const gem of gems) {
      if (gem.isBlueChip) {
        issues.push({ scope, severity: "error", message: `generational gem must not be blue chip` });
      }
      if (gem.isGenerationalBust) {
        issues.push({ scope, severity: "error", message: `recruit cannot be both generational gem and bust` });
      }
      const gemOvrRange = GEN_GEM_OVR[gem.starRank ?? 3];
      if (gemOvrRange) {
        const [lo, hi] = gemOvrRange;
        if ((gem.overall ?? 0) < lo || (gem.overall ?? 0) > hi) {
          issues.push({
            scope,
            severity: "error",
            message: `generational gem ${gem.starRank}★ OVR=${gem.overall} must be ${lo}-${hi}`,
          });
        }
      }
      const gemAbilCount = (gem.abilities as string[] | undefined)?.length ?? 0;
      if (gemAbilCount < 5 || gemAbilCount > 7) {
        issues.push({
          scope,
          severity: "error",
          message: `generational gem ability count=${gemAbilCount} outside 5-7`,
        });
      }
    }

    // 4. Generational bust invariants: never blue chip, star 3-5, star-relative OVR
    for (const bust of busts) {
      if (bust.isBlueChip) {
        issues.push({ scope, severity: "error", message: `generational bust must not be blue chip` });
      }
      if ((bust.starRank ?? 0) < 3 || (bust.starRank ?? 0) > 5) {
        issues.push({
          scope,
          severity: "error",
          message: `generational bust starRank=${bust.starRank} outside 3-5`,
        });
      }
      const bustOvrRange = GEN_BUST_OVR[bust.starRank ?? 3];
      if (bustOvrRange) {
        const [lo, hi] = bustOvrRange;
        if ((bust.overall ?? 0) < lo || (bust.overall ?? 0) > hi) {
          issues.push({
            scope,
            severity: "error",
            message: `generational bust ${bust.starRank}★ OVR=${bust.overall} must be ${lo}-${hi}`,
          });
        }
      }
    }

    // 5. Ability validity: canonical names, position-appropriateness, no duplicates.
    // Specifically enforces that Laser Beam (outfield-only) never appears on non-OF recruits.
    for (const r of recruits) {
      const pos = r.position ?? "SP";
      const abilities: string[] = (r.abilities as string[] | undefined) ?? [];
      const validForPosition = new Set(getAbilitiesForPosition(pos).map(a => a.name));
      const seen = new Set<string>();

      for (const ability of abilities) {
        if (!CANONICAL_ABILITY_NAMES.has(ability)) {
          issues.push({
            scope,
            severity: "error",
            message: `${r.firstName} ${r.lastName} (${pos}): unknown ability "${ability}"`,
          });
        } else if (!validForPosition.has(ability)) {
          const laserNote =
            ability === "Laser Beam" && !OUTFIELD_POSITIONS.has(pos)
              ? " (Laser Beam is outfield-only)"
              : "";
          issues.push({
            scope,
            severity: "error",
            message: `${r.firstName} ${r.lastName} (${pos}): ability "${ability}" not valid for this position${laserNote}`,
          });
        }
        if (seen.has(ability)) {
          issues.push({
            scope,
            severity: "error",
            message: `${r.firstName} ${r.lastName} (${pos}): ability "${ability}" appears more than once`,
          });
        }
        seen.add(ability);
      }
    }

    // 6. OVR bounds for everyone
    for (const r of recruits) {
      const ovr = r.overall ?? 0;
      if (r.isGenerationalGem) {
        // Checked per-gem above with star-relative bands — skip flat check here
      } else if (r.isGenerationalBust) {
        // Checked per-bust above with star-relative bands — skip flat check here
      } else if (r.isBlueChip) {
        if (ovr < 540 || ovr > 599) {
          issues.push({
            scope,
            severity: "error",
            message: `${r.firstName} ${r.lastName} (blue chip): OVR=${ovr} must be 540-599`,
          });
        }
      } else {
        if (ovr < 150 || ovr > 599) {
          issues.push({
            scope,
            severity: "error",
            message: `${r.firstName} ${r.lastName}: OVR=${ovr} must be 150-599`,
          });
        }
      }
    }

    // 6. Blue chip count ~3% (numBlueChips = max(2, floor(0.03*count) + maybe1))
    const blueChips = recruits.filter((r) => r.isBlueChip);
    if (blueChips.length < 2 || blueChips.length > 3) {
      issues.push({
        scope,
        severity: "error",
        message: `expected 2-3 blue chips for ${CLASS_SIZE}-recruit class, got ${blueChips.length}`,
      });
    }

    // 7. Blue chips must be 5★ per spec
    for (const bc of blueChips) {
      if (bc.starRank !== 5) {
        issues.push({
          scope,
          severity: "error",
          message: `${bc.firstName} ${bc.lastName} (blue chip): starRank=${bc.starRank} must be 5`,
        });
      }
    }
  });

  return issues;
}

function validateAggregateDistribution(
  classes: ReturnType<typeof generateRecruitClass>[],
  scopeLabel: string,
  expected: DistributionTolerance[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const total = classes.reduce((s, c) => s + c.length, 0);
  if (total === 0) return issues;

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const recruits of classes) {
    for (const r of recruits) {
      const star = (r.starRank ?? 3) as 1 | 2 | 3 | 4 | 5;
      counts[star] = (counts[star] ?? 0) + 1;
    }
  }

  for (const exp of expected) {
    const pct = counts[exp.star] / total;
    if (pct < exp.minPct || pct > exp.maxPct) {
      issues.push({
        scope: `${scopeLabel} aggregate`,
        severity: "error",
        message: `${exp.star}★ share=${(pct * 100).toFixed(1)}% outside expected ${(exp.minPct * 100).toFixed(0)}-${(exp.maxPct * 100).toFixed(0)}% (n=${total})`,
      });
    }
  }

  return issues;
}

function runTrials(theme: RecruitingTheme | undefined, n: number) {
  const classes: ReturnType<typeof generateRecruitClass>[] = [];
  for (let i = 0; i < n; i++) {
    classes.push(generateRecruitClass(CLASS_SIZE, theme ? { theme } : undefined));
  }
  return classes;
}

function main() {
  const skip = process.env.SKIP_RECRUIT_VALIDATION === "1";
  const issues: ValidationIssue[] = [];

  // Per-class invariants are checked across every theme, since gem/bust/OVR
  // bounds and blue-chip counts must hold regardless of theme.
  const allThemes: (RecruitingTheme | undefined)[] = [
    "balanced",
    "high_velocity",
    "sluggers",
    "top_heavy",
    "hidden_gems",
  ];

  for (const theme of allThemes) {
    const label = theme ?? "random";
    const classes = runTrials(theme, TRIALS_PER_THEME);
    issues.push(...validatePerClassInvariants(classes, label));
  }

  // Star distribution is theme-dependent. Only the standard (non-top_heavy)
  // themes follow the documented spec band.
  const standardThemes: RecruitingTheme[] = ["balanced", "high_velocity", "sluggers", "hidden_gems"];
  for (const theme of standardThemes) {
    const classes = runTrials(theme, TRIALS_PER_THEME);
    issues.push(...validateAggregateDistribution(classes, theme, STANDARD_DISTRIBUTION));
  }

  for (const i of issues) {
    const tag = skip ? "WARN" : "ERROR";
    console.log(`[${tag}] recruit-class / ${i.scope}: ${i.message}`);
  }

  console.log("");
  if (skip) {
    console.log(`Recruit-class validation: ${issues.length} issue(s) found (skip mode — not failing build)`);
    return;
  }
  console.log(`Recruit-class validation: ${issues.length} error(s)`);
  if (issues.length > 0) {
    console.error(
      "\nRecruit-class validation failed. Fix the errors above, or set SKIP_RECRUIT_VALIDATION=1 to bypass for emergency builds.",
    );
    process.exit(1);
  }
}

main();
