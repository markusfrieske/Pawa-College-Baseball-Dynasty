/**
 * Attribute/position consistency validator.
 *
 * Catches players whose attributes don't match their position — the most
 * common symptom of a position conversion (P→OF, OF→P, etc.) where only
 * the `position` field was updated but the attribute block wasn't.
 *
 * Rules applied per position group:
 *
 *   Pitchers (P/SP/RP/CP):
 *     - velocity + stuff + control + stamina must sum to ≥ 60
 *       (a legit pitcher should have meaningful pitching attrs)
 *     - hitForAvg + power must both be ≤ 30
 *       (pitchers hitting with OF-level batting stats is the leak)
 *     - At least one of pitchFB or pitch2S must be 1 (has a fastball)
 *
 *   Position players (everyone else):
 *     - hitForAvg + power + speed + fielding must sum to ≥ 80
 *       (a legit hitter/fielder should have meaningful batting/fielding attrs)
 *     - velocity + stuff must both be ≤ 25
 *       (a position player with pitcher-level velo/stuff is the leak)
 *
 * Violations are hard errors — process exits 1.
 */

import { ALL_REAL_ROSTERS } from "../server/realRosters";

const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP"]);

interface Violation {
  team: string;
  player: string;
  position: string;
  rule: string;
  values: string;
}

const violations: Violation[] = [];

const teamCount  = Object.keys(ALL_REAL_ROSTERS).length;
const playerCount = Object.values(ALL_REAL_ROSTERS).reduce((n, p) => n + p.length, 0);
console.log(`Scanning ${teamCount} teams (${playerCount} players) for attribute/position mismatches...`);

for (const [team, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players) {
    const fullName = `${p.firstName} ${p.lastName}`;
    const fail = (rule: string, values: string) =>
      violations.push({ team, player: fullName, position: p.position, rule, values });

    const vel  = p.velocity ?? 0;
    const ctrl = p.control  ?? 0;
    const stam = p.stamina  ?? 0;
    const stuf = p.stuff    ?? 0;
    const hit  = p.hitForAvg ?? 0;
    const pow  = p.power    ?? 0;
    const spd  = p.speed    ?? 0;
    const fld  = p.fielding ?? 0;

    if (PITCHER_POSITIONS.has(p.position)) {
      // Pitching attr sum check
      const pitchSum = vel + stuf + ctrl + stam;
      if (pitchSum < 60) {
        fail(
          "pitcher with suspiciously low pitching attributes (vel+stuff+ctrl+stam < 60)",
          `vel=${vel} stuff=${stuf} ctrl=${ctrl} stam=${stam} → sum=${pitchSum}`
        );
      }
      // Batting attr leak check
      if (hit > 30) {
        fail(
          "pitcher with hitter-level hitForAvg (> 30) — likely position-conversion leak",
          `hitForAvg=${hit}`
        );
      }
      if (pow > 30) {
        fail(
          "pitcher with hitter-level power (> 30) — likely position-conversion leak",
          `power=${pow}`
        );
      }
      // Must have some kind of fastball
      const hasFB = (p.pitchFB ?? 0) > 0 || (p.pitch2S ?? 0) > 0;
      if (!hasFB) {
        fail(
          "pitcher has neither pitchFB nor pitch2S set — missing fastball pitch mix",
          `pitchFB=${p.pitchFB ?? 0} pitch2S=${p.pitch2S ?? 0}`
        );
      }
    } else {
      // Batting/fielding attr sum check
      const batSum = hit + pow + spd + fld;
      if (batSum < 80) {
        fail(
          "position player with suspiciously low batting/fielding attributes (hit+pow+spd+fld < 80)",
          `hit=${hit} pow=${pow} spd=${spd} fld=${fld} → sum=${batSum}`
        );
      }
      // Pitching attr leak check
      if (vel > 25) {
        fail(
          "position player with pitcher-level velocity (> 25) — likely position-conversion leak",
          `velocity=${vel}`
        );
      }
      if (stuf > 25) {
        fail(
          "position player with pitcher-level stuff (> 25) — likely position-conversion leak",
          `stuff=${stuf}`
        );
      }
    }
  }
}

if (violations.length === 0) {
  console.log("✓ All player attributes are consistent with their position across all roster files.");
  process.exit(0);
}

console.error(`\n✗ Found ${violations.length} attribute/position mismatch(es):\n`);
for (const v of violations) {
  console.error(`  [${v.team}] ${v.player} (${v.position}): ${v.rule}`);
  console.error(`    → ${v.values}`);
}
console.error(
  `\nFix: when changing a player's position field, also update their attributes to match.` +
  `\n  Pitchers need velocity/stuff/control/stamina ≥ 60 total and pitchFB or pitch2S = 1.` +
  `\n  Position players need hitForAvg/power/speed/fielding ≥ 80 total.`
);
process.exit(1);
