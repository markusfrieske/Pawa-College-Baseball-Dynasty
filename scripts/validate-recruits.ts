/**
 * validate-recruits — generates sample recruiting classes and verifies that
 * the ability generation pipeline never assigns position-restricted abilities
 * to ineligible positions.
 *
 * Key rule enforced:
 *   "Laser Beam" is an outfield-only ability (OF/LF/CF/RF).
 *   Any non-outfield recruit (pitcher, catcher, infielder) with Laser Beam
 *   is a violation and causes this validator to exit 1.
 *
 * Additionally validates:
 *   - Every ability on every generated recruit exists in the canonical list.
 *   - Every ability is valid for the recruit's position per getAbilitiesForPosition().
 *   - No recruit has duplicate abilities.
 */

import { generateRecruitClass } from "../server/recruit-generator";
import { ALL_ABILITIES, getAbilitiesForPosition } from "../shared/abilities";

const SAMPLE_CLASSES = 10;
const CLASS_SIZE = 80;

const CANONICAL_NAMES = new Set(ALL_ABILITIES.map(a => a.name));
const OUTFIELD_POSITIONS = new Set(["OF", "LF", "CF", "RF"]);

// ── Star-relative OVR band tables ──────────────────────────────────────────
// Each archetype's OVR must fall within the expected [lo, hi] for the recruit's
// *displayed* starRating. These mirror the clamp logic in recruit-generator.ts.
const GEM_OVR_BANDS: Record<number, [number, number]> = {
  1: [300, 399], 2: [400, 499], 3: [500, 539], 4: [540, 599],
};
const BUST_OVR_BANDS: Record<number, [number, number]> = {
  3: [150, 199], 4: [200, 299], 5: [300, 399],
};
const GEN_GEM_OVR_BANDS: Record<number, [number, number]> = {
  1: [400, 499], 2: [500, 539], 3: [540, 599],
};
const GEN_BUST_OVR_BANDS: Record<number, [number, number]> = {
  3: [150, 199], 4: [150, 199], 5: [200, 299],
};
const NORMAL_OVR_BANDS: Record<number, [number, number]> = {
  1: [150, 299], 2: [150, 399], 3: [200, 499], 4: [300, 539], 5: [400, 539],
};

interface Violation {
  kind: "position-mismatch" | "unknown-ability" | "duplicate-ability" | "ovr-band";
  recruitName: string;
  position: string;
  ability: string;
  detail?: string;
}

const violations: Violation[] = [];
let totalRecruits = 0;

for (let c = 0; c < SAMPLE_CLASSES; c++) {
  const recruits = generateRecruitClass(CLASS_SIZE);

  for (const recruit of recruits) {
    totalRecruits++;
    const pos = recruit.position ?? "SP";
    const playerName = `${recruit.firstName} ${recruit.lastName}`;
    const abilities: string[] = recruit.abilities ?? [];
    const ovr = recruit.overall ?? 0;
    const star = recruit.starRating ?? 3;

    // ── OVR band check ────────────────────────────────────────────────────
    const checkBand = (bands: Record<number, [number, number]>, label: string) => {
      const range = bands[star];
      if (!range) return; // star rank not in table (e.g. 5★ gem doesn't exist) — skip
      const [lo, hi] = range;
      if (ovr < lo || ovr > hi) {
        violations.push({
          kind: "ovr-band",
          recruitName: playerName,
          position: pos,
          ability: "",
          detail: `${label} ${star}★ OVR=${ovr} outside expected [${lo}–${hi}]`,
        });
      }
    };

    const isGenGem  = (recruit as any).isGenerationalGem  === true;
    const isGenBust = (recruit as any).isGenerationalBust === true;

    if (isGenGem) {
      checkBand(GEN_GEM_OVR_BANDS, "GenGem");
    } else if (isGenBust) {
      checkBand(GEN_BUST_OVR_BANDS, "GenBust");
    } else if (recruit.isBlueChip) {
      if (ovr < 540 || ovr > 599) {
        violations.push({
          kind: "ovr-band", recruitName: playerName, position: pos, ability: "",
          detail: `BlueChip OVR=${ovr} outside expected [540–599]`,
        });
      }
    } else if (recruit.isGem) {
      checkBand(GEM_OVR_BANDS, "Gem");
    } else if (recruit.isBust) {
      checkBand(BUST_OVR_BANDS, "Bust");
    } else if ((recruit as any).playerArchetype === "normal") {
      // Normal player — verify ±1-tier OVR range
      checkBand(NORMAL_OVR_BANDS, "Normal");
    }
    // late_bloomer, overdraft, raw: no OVR band check (complex interaction with attr depression/inflation)

    const validForPosition = new Set(
      getAbilitiesForPosition(pos).map(a => a.name)
    );

    const seen = new Set<string>();
    for (const ability of abilities) {
      if (!CANONICAL_NAMES.has(ability)) {
        violations.push({ kind: "unknown-ability", recruitName: playerName, position: pos, ability });
        continue;
      }
      if (!validForPosition.has(ability)) {
        violations.push({ kind: "position-mismatch", recruitName: playerName, position: pos, ability });
      }
      if (seen.has(ability)) {
        violations.push({ kind: "duplicate-ability", recruitName: playerName, position: pos, ability });
      }
      seen.add(ability);
    }
  }
}

const mismatchViolations = violations.filter(v => v.kind === "position-mismatch");
const unknownViolations = violations.filter(v => v.kind === "unknown-ability");
const duplicateViolations = violations.filter(v => v.kind === "duplicate-ability");
const ovrBandViolations = violations.filter(v => v.kind === "ovr-band");

// Laser Beam non-outfield violations (subset of mismatch — explicit call-out)
const laserBeamViolations = mismatchViolations.filter(
  v => v.ability === "Laser Beam" && !OUTFIELD_POSITIONS.has(v.position)
);

console.log(`Scanned ${totalRecruits} generated recruits (${SAMPLE_CLASSES} classes × ${CLASS_SIZE})...`);

if (violations.length === 0) {
  console.log(
    "✓ All generated recruit abilities are valid, position-appropriate, and deduplicated."
  );
  process.exit(0);
}

if (ovrBandViolations.length > 0) {
  console.error(`\n✗ Found ${ovrBandViolations.length} OVR band violation(s) — archetype OVR outside star-relative range:`);
  for (const v of ovrBandViolations.slice(0, 20)) {
    console.error(`  ${v.recruitName} (${v.position}): ${v.detail}`);
  }
}

if (unknownViolations.length > 0) {
  console.error(`\n✗ Found ${unknownViolations.length} unknown ability name(s) in generated recruits:`);
  for (const v of unknownViolations.slice(0, 10)) {
    console.error(`  ${v.recruitName} (${v.position}): unknown ability "${v.ability}"`);
  }
}

if (laserBeamViolations.length > 0) {
  console.error(`\n✗ Found ${laserBeamViolations.length} non-outfield recruit(s) with "Laser Beam" (outfield-only ability):`);
  for (const v of laserBeamViolations.slice(0, 10)) {
    console.error(`  ${v.recruitName} (${v.position}): has "Laser Beam"`);
  }
  console.error(`\n  Fix: Laser Beam must only appear on OF/LF/CF/RF positions.`);
  console.error(`  Check getAbilitiesForPosition() in shared/abilities.ts and sanitizeAbilities().`);
}

if (mismatchViolations.length > laserBeamViolations.length) {
  const otherMismatches = mismatchViolations.filter(v => v.ability !== "Laser Beam" || OUTFIELD_POSITIONS.has(v.position));
  if (otherMismatches.length > 0) {
    console.error(`\n✗ Found ${otherMismatches.length} other position-ability mismatch(es) in generated recruits:`);
    for (const v of otherMismatches.slice(0, 10)) {
      console.error(`  ${v.recruitName} (${v.position}): ability "${v.ability}" not valid for this position`);
    }
  }
}

if (duplicateViolations.length > 0) {
  console.error(`\n✗ Found ${duplicateViolations.length} duplicate ability name(s) in generated recruits:`);
  for (const v of duplicateViolations.slice(0, 10)) {
    console.error(`  ${v.recruitName} (${v.position}): ability "${v.ability}" appears more than once`);
  }
}

process.exit(1);
