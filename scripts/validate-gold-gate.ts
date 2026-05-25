/**
 * validate-gold-gate.ts
 *
 * Enforces the rule: no player with a calibrated OVR below 450 may hold a
 * gold-tier special ability.  Runs against ALL_REAL_ROSTERS (the fully
 * calibrated data) so that conference-tier scaling is accounted for — the
 * same approach used by strip-gold-batch-files.ts.
 *
 * Run directly:  npx tsx scripts/validate-gold-gate.ts
 * Run via CI:    npx tsx scripts/validate-all.ts  (auto-discovered)
 *
 * Exit 0 — no violations found.
 * Exit 1 — one or more gold-gate violations found; fix before merging.
 */

import { ALL_ABILITIES, calculateOVR } from "../shared/abilities";
import { ALL_REAL_ROSTERS } from "../server/realRosters";

const GOLD_OVR_THRESHOLD = 450;

const GOLD_NAMES = new Set(
  ALL_ABILITIES.filter((a) => a.tier === "gold").map((a) => a.name)
);

interface GoldGateViolation {
  team: string;
  player: string;
  position: string;
  ovr: number;
  goldAbilities: string[];
}

const violations: GoldGateViolation[] = [];

const teamCount = Object.keys(ALL_REAL_ROSTERS).length;
const playerCount = Object.values(ALL_REAL_ROSTERS).reduce((n, p) => n + p.length, 0);
console.log(
  `Scanning ${teamCount} teams (${playerCount} players) for gold-gate violations (OVR < ${GOLD_OVR_THRESHOLD})...`
);

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const player of players) {
    const playerName = `${player.firstName} ${player.lastName}`;

    const goldAbilities = (player.abilities ?? []).filter((name) =>
      GOLD_NAMES.has(name)
    );

    if (goldAbilities.length === 0) continue;

    const ovr = calculateOVR({ ...player, abilities: [] });

    if (ovr < GOLD_OVR_THRESHOLD) {
      violations.push({
        team,
        player: playerName,
        position: player.position,
        ovr,
        goldAbilities,
      });
    }
  }
}

if (violations.length === 0) {
  console.log(
    `✓ Gold-gate check passed: every player with a gold ability has OVR ≥ ${GOLD_OVR_THRESHOLD}.`
  );
  process.exit(0);
}

console.error(
  `\n✗ Found ${violations.length} gold-gate violation(s) — gold abilities on players with OVR < ${GOLD_OVR_THRESHOLD}:\n`
);

for (const v of violations) {
  console.error(
    `  [${v.team}] ${v.player} (${v.position}) OVR ${v.ovr}: gold abilities [${v.goldAbilities.join(", ")}]`
  );
}

console.error(
  `\nFix: remove gold abilities from these players or raise their attributes so their OVR reaches ${GOLD_OVR_THRESHOLD}.`
);
console.error(
  `  Run \`npx tsx scripts/strip-gold-batch-files.ts\` to auto-strip and replace with blue alternatives.`
);

process.exit(1);
