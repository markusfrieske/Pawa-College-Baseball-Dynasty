/**
 * Audit gold abilities for real 2026 MLB draft prospects across all conference rosters.
 * Flags any player with OVR ≥ 450 (strong 4★ / 5★) who has zero gold abilities.
 * Also reports gold-ability counts per player for review.
 */

import { SEC_BATCH1_ROSTERS } from "../server/secBatch1";
import { SEC_BATCH2_ROSTERS } from "../server/secBatch2";
import { SEC_BATCH3_ROSTERS } from "../server/secBatch3";
import { ACC_BATCH1_ROSTERS } from "../server/accRostersBatch1";
import { ACC_BATCH2_ROSTERS } from "../server/accRostersBatch2";
import { ACC_BATCH3_ROSTERS } from "../server/accRostersBatch3";
import { BIG_TEN_BATCH1_ROSTERS } from "../server/bigTenBatch1";
import { BIG_TEN_BATCH2_ROSTERS } from "../server/bigTenBatch2";
import { BIG_TEN_BATCH3_ROSTERS } from "../server/bigTenBatch3";
import { BIG_12_ROSTERS } from "../server/big12Rosters";
import { PAC12_ROSTERS } from "../server/pac12Rosters";
import { AAC_ROSTERS } from "../server/aacRosters";
import { SUN_BELT_ROSTERS } from "../server/sunBeltRosters";
import { WCC_ROSTERS } from "../server/wccRosters";
import { BIG_WEST_ROSTERS } from "../server/bigWestRosters";
import { MO_VALLEY_ROSTERS } from "../server/moValleyRosters";
import { IVY_LEAGUE_ROSTERS } from "../server/ivyLeagueRosters";
import { HBCU_ROSTERS } from "../server/hbcuRosters";
import { calculateOVR, getAbilityByName } from "../shared/abilities";

const ALL_ROSTERS: Record<string, Record<string, any[]>> = {
  "SEC-1": SEC_BATCH1_ROSTERS,
  "SEC-2": SEC_BATCH2_ROSTERS,
  "SEC-3": SEC_BATCH3_ROSTERS,
  "ACC-1": ACC_BATCH1_ROSTERS,
  "ACC-2": ACC_BATCH2_ROSTERS,
  "ACC-3": ACC_BATCH3_ROSTERS,
  "BigTen-1": BIG_TEN_BATCH1_ROSTERS,
  "BigTen-2": BIG_TEN_BATCH2_ROSTERS,
  "BigTen-3": BIG_TEN_BATCH3_ROSTERS,
  "Big12": BIG_12_ROSTERS,
  "Pac12": PAC12_ROSTERS,
  "AAC": AAC_ROSTERS,
  "SunBelt": SUN_BELT_ROSTERS,
  "WCC": WCC_ROSTERS,
  "BigWest": BIG_WEST_ROSTERS,
  "MoValley": MO_VALLEY_ROSTERS,
  "Ivy": IVY_LEAGUE_ROSTERS,
  "HBCU": HBCU_ROSTERS,
};

const CONF_LABEL: Record<string, string> = {
  "SEC-1": "SEC", "SEC-2": "SEC", "SEC-3": "SEC",
  "ACC-1": "ACC", "ACC-2": "ACC", "ACC-3": "ACC",
  "BigTen-1": "Big Ten", "BigTen-2": "Big Ten", "BigTen-3": "Big Ten",
  "Big12": "Big 12", "Pac12": "Pac-12",
  "AAC": "AAC", "SunBelt": "Sun Belt", "WCC": "WCC",
  "BigWest": "Big West", "MoValley": "Mo Valley",
  "Ivy": "Ivy League", "HBCU": "HBCU",
};

interface ProspectReport {
  conf: string;
  team: string;
  name: string;
  pos: string;
  elig: string;
  ovr: number;
  goldCount: number;
  totalAbilities: number;
  abilities: string[];
}

const OVR_THRESHOLD = 450;

const missing: ProspectReport[] = [];
const present: ProspectReport[] = [];

for (const [batchKey, teams] of Object.entries(ALL_ROSTERS)) {
  const conf = CONF_LABEL[batchKey];
  for (const [team, players] of Object.entries(teams)) {
    for (const p of players) {
      const ovr = calculateOVR({ ...p, position: p.position });
      if (ovr < OVR_THRESHOLD) continue;

      const abilities: string[] = p.abilities ?? [];
      let goldCount = 0;
      for (const a of abilities) {
        const ab = getAbilityByName(a);
        if (ab && ab.tier === "gold") goldCount++;
      }

      const rec: ProspectReport = {
        conf,
        team,
        name: `${p.firstName} ${p.lastName}`,
        pos: p.position,
        elig: p.eligibility,
        ovr,
        goldCount,
        totalAbilities: abilities.length,
        abilities,
      };

      if (goldCount === 0) {
        missing.push(rec);
      } else {
        present.push(rec);
      }
    }
  }
}

// Sort by OVR desc
missing.sort((a, b) => b.ovr - a.ovr);
present.sort((a, b) => b.ovr - a.ovr);

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Gold Ability Audit — MLB Draft Prospects (OVR ≥ 450)");
console.log("══════════════════════════════════════════════════════════════\n");

console.log(`Total prospects (OVR ≥ 450): ${missing.length + present.length}`);
console.log(`  ✓ Have ≥1 gold ability:   ${present.length}`);
console.log(`  ✗ Missing gold ability:   ${missing.length}\n`);

if (missing.length > 0) {
  console.log("── MISSING GOLD ABILITIES ──────────────────────────────────────");
  for (const p of missing) {
    const absStr = p.abilities.length > 0 ? p.abilities.join(", ") : "(none)";
    console.log(`  [${p.conf}] ${p.team} — ${p.name} (${p.elig} ${p.pos}) OVR=${p.ovr}`);
    console.log(`    Current: ${absStr}`);
  }
}

console.log("\n── HAVE GOLD ABILITIES (top 30) ────────────────────────────────");
for (const p of present.slice(0, 30)) {
  const goldList = p.abilities.filter(a => {
    const ab = getAbilityByName(a);
    return ab && ab.tier === "gold";
  });
  console.log(`  [${p.conf}] ${p.team} — ${p.name} (${p.elig} ${p.pos}) OVR=${p.ovr}  gold=[${goldList.join(", ")}]`);
}

// Summary by conference
console.log("\n── BY CONFERENCE ───────────────────────────────────────────────");
const confMap: Record<string, { ok: number; missing: number }> = {};
for (const p of [...missing, ...present]) {
  if (!confMap[p.conf]) confMap[p.conf] = { ok: 0, missing: 0 };
  if (p.goldCount === 0) confMap[p.conf].missing++;
  else confMap[p.conf].ok++;
}
for (const [conf, counts] of Object.entries(confMap).sort((a, b) => (b[1].missing - a[1].missing))) {
  const total = counts.ok + counts.missing;
  const pct = Math.round((counts.ok / total) * 100);
  const flag = counts.missing > 0 ? "⚠" : "✓";
  console.log(`  ${flag} ${conf.padEnd(12)} ${counts.ok}/${total} have gold (${pct}%)  missing=${counts.missing}`);
}

console.log("");
