import { ALL_ABILITIES, getAbilitiesForPosition } from "../shared/abilities";
import { ALL_REAL_ROSTERS } from "../server/realRosters";

const CANONICAL_NAMES = new Set(ALL_ABILITIES.map((a) => a.name));

const REQUIRED_STRING_FIELDS = ["position", "eligibility", "homeState"] as const;
type RequiredStringField = typeof REQUIRED_STRING_FIELDS[number];

const NUMERIC_ATTRS = [
  "hitForAvg", "power", "speed", "arm", "fielding", "errorResistance",
  "velocity", "control", "stamina", "stuff",
] as const;

interface UnknownAbilityViolation {
  kind: "unknown";
  team: string;
  player: string;
  position: string;
  badAbility: string;
}

interface PositionMismatchViolation {
  kind: "position-mismatch";
  team: string;
  player: string;
  position: string;
  badAbility: string;
}

interface NoAbilitiesViolation {
  kind: "no-abilities";
  team: string;
  player: string;
  position: string;
}

interface ThinAttributesViolation {
  kind: "thin-attributes";
  team: string;
  player: string;
  position: string;
  attrSum: number;
}

interface MissingFieldViolation {
  kind: "missing-field";
  team: string;
  player: string;
  field: RequiredStringField;
}

type Violation =
  | UnknownAbilityViolation
  | PositionMismatchViolation
  | NoAbilitiesViolation
  | ThinAttributesViolation
  | MissingFieldViolation;

const violations: Violation[] = [];

const teamCount = Object.keys(ALL_REAL_ROSTERS).length;
const playerCount = Object.values(ALL_REAL_ROSTERS).reduce((n, p) => n + p.length, 0);
console.log(`Scanning ${teamCount} teams (${playerCount} players) across all conferences...`);

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const player of players) {
    const playerName = `${player.firstName} ${player.lastName}`;
    const validForPosition = new Set(
      getAbilitiesForPosition(player.position).map((a) => a.name)
    );

    // 1. Unknown / position-mismatch ability checks
    for (const ability of player.abilities) {
      if (!CANONICAL_NAMES.has(ability)) {
        violations.push({
          kind: "unknown",
          team,
          player: playerName,
          position: player.position,
          badAbility: ability,
        });
      } else if (!validForPosition.has(ability)) {
        violations.push({
          kind: "position-mismatch",
          team,
          player: playerName,
          position: player.position,
          badAbility: ability,
        });
      }
    }

    // 2. No abilities at all
    if (player.abilities.length === 0) {
      violations.push({
        kind: "no-abilities",
        team,
        player: playerName,
        position: player.position,
      });
    }

    // 3. All primary numeric attributes summing to zero (effectively blank player)
    const attrSum = NUMERIC_ATTRS.reduce(
      (sum, field) => sum + ((player as Record<string, unknown>)[field] as number ?? 0),
      0
    );
    if (attrSum === 0) {
      violations.push({
        kind: "thin-attributes",
        team,
        player: playerName,
        position: player.position,
        attrSum,
      });
    }

    // 4. Missing required string fields
    for (const field of REQUIRED_STRING_FIELDS) {
      const value = (player as Record<string, unknown>)[field];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        violations.push({
          kind: "missing-field",
          team,
          player: playerName,
          field,
        });
      }
    }
  }
}

const unknownViolations = violations.filter((v) => v.kind === "unknown") as UnknownAbilityViolation[];
const mismatchViolations = violations.filter((v) => v.kind === "position-mismatch") as PositionMismatchViolation[];
const noAbilitiesViolations = violations.filter((v) => v.kind === "no-abilities") as NoAbilitiesViolation[];
const thinAttrViolations = violations.filter((v) => v.kind === "thin-attributes") as ThinAttributesViolation[];
const missingFieldViolations = violations.filter((v) => v.kind === "missing-field") as MissingFieldViolation[];

// Hard errors: unknown names and position mismatches fail the run.
// Warnings: no-abilities, thin-attributes, missing-field are printed but don't fail.
const hardErrorCount = unknownViolations.length + mismatchViolations.length;

if (violations.length === 0) {
  console.log(
    "✓ All ability names are valid, position-appropriate, and all players have complete data across all roster files."
  );
  process.exit(0);
}

if (unknownViolations.length > 0) {
  console.error(
    `\n✗ Found ${unknownViolations.length} unknown ability name(s) in roster files:\n`
  );
  for (const v of unknownViolations) {
    console.error(
      `  [${v.team}] ${v.player} (${v.position}): unknown ability "${v.badAbility}"`
    );
  }
  console.error(
    `\nFix: ensure every ability string matches a name exported from shared/abilities.ts`
  );
}

if (mismatchViolations.length > 0) {
  console.error(
    `\n✗ Found ${mismatchViolations.length} position-ability mismatch(es) in roster files:\n`
  );
  for (const v of mismatchViolations) {
    console.error(
      `  [${v.team}] ${v.player} (${v.position}): ability "${v.badAbility}" is not valid for this position type`
    );
  }
  console.error(
    `\nFix: use getAbilitiesForPosition(position) from shared/abilities.ts to confirm valid abilities per position.`
  );
  console.error(`  Pitchers (SP/RP/CP/P) use pitcher + neutral abilities.`);
  console.error(`  Catchers (C) use fielder + catcher abilities.`);
  console.error(`  All other fielders use fielder abilities only.`);
}

if (noAbilitiesViolations.length > 0) {
  console.warn(
    `\n⚠ Warning: ${noAbilitiesViolations.length} player(s) have an empty abilities array (non-fatal):`
  );
  for (const v of noAbilitiesViolations) {
    console.warn(`  [${v.team}] ${v.player} (${v.position}): has 0 special abilities`);
  }
  console.warn(
    `  Note: some roster files intentionally omit abilities for lower-rated players.`
  );
}

if (thinAttrViolations.length > 0) {
  console.warn(
    `\n⚠ Warning: ${thinAttrViolations.length} player(s) have all-zero primary attributes (non-fatal):`
  );
  for (const v of thinAttrViolations) {
    console.warn(
      `  [${v.team}] ${v.player} (${v.position}): primary attributes sum to ${v.attrSum}`
    );
  }
  console.warn(
    `  Fix: set hitForAvg/power/speed/arm/fielding/errorResistance/velocity/control/stamina/stuff to non-zero values.`
  );
}

if (missingFieldViolations.length > 0) {
  console.warn(
    `\n⚠ Warning: ${missingFieldViolations.length} player(s) have missing required field(s) (non-fatal):`
  );
  for (const v of missingFieldViolations) {
    console.warn(`  [${v.team}] ${v.player}: field "${v.field}" is empty or missing`);
  }
  console.warn(
    `  Fix: ensure position, eligibility, and homeState are non-empty strings for every player.`
  );
}

if (hardErrorCount === 0) {
  console.log(
    `\n✓ No hard errors found. ${violations.length > 0 ? `(${violations.length} warning(s) above are informational only.)` : ""}`
  );
  process.exit(0);
}

process.exit(1);
