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

interface Violation {
  kind: "position-mismatch" | "unknown-ability" | "duplicate-ability";
  recruitName: string;
  position: string;
  ability: string;
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
