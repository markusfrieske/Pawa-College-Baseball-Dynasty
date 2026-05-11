/**
 * sim-audit.ts
 * Audits game simulation balance: runs per game (RPG) and K/9 by tier.
 *
 * Run: npx tsx scripts/sim-audit.ts
 *
 * Target (college baseball):
 *   RPG:  5–8 per team per game in even matchups
 *   K/9:  7–14 for starting pitchers
 *   BB/9: 2–6
 */

// ---------------------------------------------------------------------------
// Minimal player shape used by simulation
// ---------------------------------------------------------------------------
interface Player {
  overall: number;
  position: string;
  velocity: number;
  control: number;
  stuff: number;
  hitForAvg: number;
  power: number;
  speed: number;
}

// ---------------------------------------------------------------------------
// Poisson sampler (matches routes.ts exactly)
// ---------------------------------------------------------------------------
function poissonSample(lambda: number): number {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// ---------------------------------------------------------------------------
// Core scoring formula — parameterised so we can test old vs new base value
// ---------------------------------------------------------------------------
function scoreGame(
  homePlayers: Player[],
  awayPlayers: Player[],
  base: number,   // 4.5 = old, 5.75 = new
  cap: number,    // 10 = old, 13 = new
): { homeScore: number; awayScore: number } {
  const avgOvr = (ps: Player[]) =>
    ps.length ? ps.reduce((s, p) => s + (p.overall || 300), 0) / ps.length : 300;

  const homeStrength = avgOvr(homePlayers);
  const awayStrength = avgOvr(awayPlayers);
  const strengthDiff = (homeStrength - awayStrength) / 300;

  let homeExpected = base + strengthDiff * 5.0 + 0.25;
  let awayExpected = base - strengthDiff * 5.0;
  homeExpected = Math.max(1.0, Math.min(cap, homeExpected));
  awayExpected = Math.max(1.0, Math.min(cap, awayExpected));

  let homeScore = poissonSample(homeExpected);
  let awayScore = poissonSample(awayExpected);
  homeScore = Math.max(0, Math.min(20, homeScore));
  awayScore = Math.max(0, Math.min(20, awayScore));
  if (homeScore === awayScore) {
    if (Math.random() > 0.5) homeScore++; else awayScore++;
  }
  return { homeScore, awayScore };
}

// ---------------------------------------------------------------------------
// Starter K/9 formula (from generateBoxScore in routes.ts)
// ---------------------------------------------------------------------------
function starterK9(pitcher: Player): number {
  const velocityFactor = pitcher.velocity / 100;
  const stuffFactor    = pitcher.stuff    / 100;
  return 3 + velocityFactor * 6 + stuffFactor * 5;
}

// ---------------------------------------------------------------------------
// Starter BB/9 formula (from generateBoxScore in routes.ts)
// ---------------------------------------------------------------------------
function starterBB9(pitcher: Player): number {
  const controlFactor = pitcher.control / 100;
  return Math.max(0.3, 5.0 - controlFactor * 4.5);
}

// ---------------------------------------------------------------------------
// Batter strikeout rate formula (from generateBoxScore in routes.ts)
// ---------------------------------------------------------------------------
function batterSoChance(hitter: Player): number {
  return Math.max(0.12, 0.38 - (hitter.hitForAvg || 50) / 290);
}

// ---------------------------------------------------------------------------
// Team profiles – representative of each conference tier
// Each team has 9 hitters + 5 pitchers (1 starter + 4 relievers)
// Attributes are calibrated to match real roster batch values
// ---------------------------------------------------------------------------
function makeTeam(
  label: string,
  avgOvr: number,
  hitForAvg: number,
  power: number,
  speed: number,
  velocity: number,
  control: number,
  stuff: number,
): { label: string; players: Player[] } {
  const players: Player[] = [];

  // 9 position players
  const hitterPositions = ["C","1B","2B","SS","3B","LF","CF","RF","DH"];
  for (const pos of hitterPositions) {
    players.push({
      overall: avgOvr + Math.floor((Math.random() - 0.5) * 40),
      position: pos,
      velocity: 0, control: 0, stuff: 0,
      hitForAvg: Math.max(1, hitForAvg + Math.floor((Math.random() - 0.5) * 16)),
      power:     Math.max(1, power     + Math.floor((Math.random() - 0.5) * 16)),
      speed:     Math.max(1, speed     + Math.floor((Math.random() - 0.5) * 16)),
    });
  }

  // 5 pitchers (1 Friday starter + 4 relievers)
  const pitcherRoles = ["FRI","LRP","MR","SU","CP"];
  for (const _ of pitcherRoles) {
    players.push({
      overall: avgOvr + Math.floor((Math.random() - 0.5) * 40),
      position: "P",
      velocity: Math.max(1, velocity + Math.floor((Math.random() - 0.5) * 12)),
      control:  Math.max(1, control  + Math.floor((Math.random() - 0.5) * 12)),
      stuff:    Math.max(1, stuff    + Math.floor((Math.random() - 0.5) * 12)),
      hitForAvg: Math.max(1, 20 + Math.floor(Math.random() * 10)),
      power: 15, speed: 40,
    });
  }

  return { label, players };
}

// Tier definitions — derived from replit.md description and roster batch files
const TIERS = {
  tier1_elite:  makeTeam("Tier-1 Elite  (SEC/ACC top, OVR≈390)",  390, 65, 62, 60, 66, 63, 64),
  tier1_mid:    makeTeam("Tier-1 Mid    (SEC/ACC mid, OVR≈340)",  340, 55, 52, 52, 61, 58, 59),
  tier2:        makeTeam("Tier-2        (AAC/Sun Belt, OVR≈295)", 295, 46, 44, 48, 56, 53, 54),
  tier3:        makeTeam("Tier-3        (WCC/MWC,      OVR≈265)", 265, 40, 38, 44, 51, 49, 50),
  tier5:        makeTeam("Tier-5        (HBCU,         OVR≈220)", 220, 32, 30, 38, 45, 44, 44),
};

// ---------------------------------------------------------------------------
// Run audit
// ---------------------------------------------------------------------------
const N_GAMES = 100;

interface AuditResult {
  matchup: string;
  homeRPG: number;
  awayRPG: number;
  k9: number;
  bb9: number;
  rpgOk: boolean;
  k9Ok: boolean;
}

function runMatchup(
  home: { label: string; players: Player[] },
  away: { label: string; players: Player[] },
  base: number,
  cap: number,
): AuditResult {
  let totalHome = 0, totalAway = 0;
  for (let i = 0; i < N_GAMES; i++) {
    // Teams are fixed per matchup; Poisson sampling provides per-game variance.
    const { homeScore, awayScore } = scoreGame(home.players, away.players, base, cap);
    totalHome += homeScore;
    totalAway += awayScore;
  }

  const homePitcher = home.players.find(p => p.position === "P")!;
  const k9  = starterK9(homePitcher);
  const bb9 = starterBB9(homePitcher);

  const homeRPG = totalHome / N_GAMES;
  const awayRPG = totalAway / N_GAMES;

  // "In range" for even matchups; cross-tier mismatches are expected to diverge
  const isEven = Math.abs(home.players.reduce((s,p)=>s+p.overall,0) -
                           away.players.reduce((s,p)=>s+p.overall,0)) < 200;
  const rpgOk = isEven
    ? homeRPG >= 5 && homeRPG <= 8 && awayRPG >= 5 && awayRPG <= 8
    : true;  // cross-tier expected to diverge
  const k9Ok = k9 >= 7 && k9 <= 14;

  return {
    matchup: `${home.label.split("(")[0].trim()} vs ${away.label.split("(")[0].trim()}`,
    homeRPG, awayRPG, k9, bb9, rpgOk, k9Ok,
  };
}

function formatRPG(v: number) { return v.toFixed(2).padStart(5); }
function checkMark(ok: boolean) { return ok ? "✓" : "✗"; }

function printSection(label: string, base: number, cap: number) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${label}  (base=${base}, cap=${cap})`);
  console.log("=".repeat(72));
  console.log(
    "  Matchup".padEnd(42) +
    "HomeRPG  AwayRPG  K/9    BB/9   RPG✓  K/9✓"
  );
  console.log("  " + "-".repeat(70));

  const matchups: Array<[keyof typeof TIERS, keyof typeof TIERS]> = [
    ["tier1_elite", "tier1_elite"],
    ["tier1_mid",   "tier1_mid"],
    ["tier2",       "tier2"],
    ["tier3",       "tier3"],
    ["tier5",       "tier5"],
    ["tier1_elite", "tier3"],
    ["tier1_elite", "tier5"],
    ["tier1_mid",   "tier2"],
    ["tier2",       "tier5"],
  ];

  let allRpgOk = true, allK9Ok = true;
  for (const [h, a] of matchups) {
    const r = runMatchup(TIERS[h], TIERS[a], base, cap);
    allRpgOk = allRpgOk && r.rpgOk;
    allK9Ok  = allK9Ok  && r.k9Ok;
    const label2 = r.matchup.length > 38 ? r.matchup.slice(0, 38) : r.matchup;
    console.log(
      `  ${label2.padEnd(40)}` +
      `${formatRPG(r.homeRPG)}    ${formatRPG(r.awayRPG)}   ` +
      `${r.k9.toFixed(1).padStart(5)}  ${r.bb9.toFixed(1).padStart(5)}  ` +
      `  ${checkMark(r.rpgOk)}     ${checkMark(r.k9Ok)}`
    );
  }
  console.log("  " + "-".repeat(70));
  console.log(`  Summary: RPG in-range for even matchups: ${allRpgOk ? "ALL PASS" : "SOME FAIL"}   K/9 in-range: ${allK9Ok ? "ALL PASS" : "SOME FAIL"}`);
}

console.log(`\n${"#".repeat(72)}`);
console.log("  Game Simulation Balance Audit");
console.log(`  ${N_GAMES} games per matchup | target RPG: 5–8 (even) | K/9: 7–14`);
console.log(`${"#".repeat(72)}`);

printSection("BEFORE fix (base=4.5, cap=10)", 4.5, 10);
printSection("AFTER fix  (base=5.75, cap=13)", 5.75, 13);

// ---------------------------------------------------------------------------
// Additional: formula-level expected-runs table (no randomness)
// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(72)}`);
console.log("  Formula-level expected runs by OVR (no randomness)");
console.log("=".repeat(72));
console.log("  HomeOVR  AwayOVR  HomeExp(old)  AwayExp(old)  HomeExp(new)  AwayExp(new)");
console.log("  " + "-".repeat(70));

const ovrPairs: Array<[number, number]> = [
  [390, 390], [340, 340], [295, 295], [265, 265], [220, 220],
  [390, 265], [390, 220], [340, 295],
];
for (const [h, a] of ovrPairs) {
  const diff = (h - a) / 300;
  const oldH = Math.max(1, Math.min(10,  4.5  + diff * 5.0 + 0.25));
  const oldA = Math.max(1, Math.min(10,  4.5  - diff * 5.0));
  const newH = Math.max(1, Math.min(13,  5.75 + diff * 5.0 + 0.25));
  const newA = Math.max(1, Math.min(13,  5.75 - diff * 5.0));
  console.log(
    `  ${String(h).padStart(7)}  ${String(a).padStart(7)}` +
    `  ${oldH.toFixed(2).padStart(12)}  ${oldA.toFixed(2).padStart(12)}` +
    `  ${newH.toFixed(2).padStart(12)}  ${newA.toFixed(2).padStart(12)}`
  );
}

console.log("\n  NOTE: Cross-tier mismatches are expected to show divergence.");
console.log("  The 5–8 RPG target applies to even-strength matchups.\n");
