import { ALL_REAL_ROSTERS } from "./server/realRosters";

const result: Array<{firstName: string; lastName: string; position: string; teamName: string; pitchVSL: number}> = [];

for (const [teamName, players] of Object.entries(ALL_REAL_ROSTERS)) {
  for (const p of players) {
    const pAny = p as Record<string, unknown>;
    const pitchVSL = pAny.pitchVSL as number | undefined;
    if (pitchVSL && pitchVSL > 0) {
      if (['P','SP','RP','CP'].includes(p.position)) {
        result.push({ firstName: p.firstName, lastName: p.lastName, position: p.position, teamName, pitchVSL });
      }
    }
  }
}

process.stdout.write(JSON.stringify(result, null, 2));
process.stderr.write(`Total: ${result.length} pitchers with pitchVSL\n`);
