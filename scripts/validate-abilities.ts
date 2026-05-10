import { ALL_ABILITIES } from "../shared/abilities";
import { SEC_REAL_ROSTERS } from "../server/realRosters";

const CANONICAL_NAMES = new Set(ALL_ABILITIES.map((a) => a.name));

interface Violation {
  team: string;
  player: string;
  badAbility: string;
}

const violations: Violation[] = [];

for (const [team, players] of Object.entries(SEC_REAL_ROSTERS)) {
  for (const player of players) {
    for (const ability of player.abilities) {
      if (!CANONICAL_NAMES.has(ability)) {
        violations.push({
          team,
          player: `${player.firstName} ${player.lastName}`,
          badAbility: ability,
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("✓ All ability names are valid across all roster files.");
  process.exit(0);
} else {
  console.error(
    `\n✗ Found ${violations.length} unknown ability name(s) in roster files:\n`
  );
  for (const v of violations) {
    console.error(`  [${v.team}] ${v.player}: "${v.badAbility}"`);
  }
  console.error(
    `\nFix: ensure every ability string matches a name exported from shared/abilities.ts`
  );
  process.exit(1);
}
