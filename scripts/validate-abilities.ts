import { ALL_ABILITIES, getAbilitiesForPosition } from "../shared/abilities";
import { SEC_REAL_ROSTERS } from "../server/realRosters";

const CANONICAL_NAMES = new Set(ALL_ABILITIES.map((a) => a.name));

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

type Violation = UnknownAbilityViolation | PositionMismatchViolation;

const violations: Violation[] = [];

for (const [team, players] of Object.entries(SEC_REAL_ROSTERS)) {
  for (const player of players) {
    const playerName = `${player.firstName} ${player.lastName}`;
    const validForPosition = new Set(
      getAbilitiesForPosition(player.position).map((a) => a.name)
    );

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
  }
}

if (violations.length === 0) {
  console.log(
    "✓ All ability names are valid and position-appropriate across all roster files."
  );
  process.exit(0);
}

const unknownViolations = violations.filter((v) => v.kind === "unknown");
const mismatchViolations = violations.filter(
  (v) => v.kind === "position-mismatch"
);

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
  console.error(
    `  Pitchers (SP/RP/CP/P) use pitcher + neutral abilities.`
  );
  console.error(
    `  Catchers (C) use fielder + catcher abilities.`
  );
  console.error(`  All other fielders use fielder abilities only.`);
}

process.exit(1);
