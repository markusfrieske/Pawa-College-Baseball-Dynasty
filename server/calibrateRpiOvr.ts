/**
 * calibrateRpiOvr.ts
 *
 * Core calibration logic that adjusts existing player OVRs in the database
 * so each in-game team's average roster OVR maps to the 2026 NCAA RPI ranking.
 *
 * Key rules:
 *  - Top 5 players by OVR on every team are never touched.
 *  - Bottom 20 players are scaled proportionally so the full-team average hits
 *    the RPI-derived OVR target.
 *  - All adjusted OVRs are clamped to 150–650.
 *  - Star ratings are recalculated from the new OVR.
 *  - All numeric attributes that feed into OVR are scaled by the same ratio.
 */

import { db } from "./db";
import { teams, leagues, players } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateOVR, getStarRatingFromOVR } from "@shared/abilities";

// ── RPI Rank Map ─────────────────────────────────────────────────────────────
// Maps in-game team name → 2026 NCAA RPI rank (or extrapolated rank).
export const RPI_RANK_MAP: Record<string, number> = {
  // ── SEC ──────────────────────────────────────────────────────────────────
  'UCLA':             1,
  'Auburn':           3,
  'Texas':            5,
  'Alabama':          6,
  'Florida':          10,
  'Georgia':          11,
  'Mississippi State':13,
  'Texas A&M':        14,
  'Ole Miss':         17,
  'Arkansas':         21,
  'Oklahoma':         24,
  'Tennessee':        31,
  'Kentucky':         37,
  'LSU':              66,
  'Vanderbilt':       73,
  'South Carolina':   139,
  'Missouri':         109,

  // ── ACC ──────────────────────────────────────────────────────────────────
  'Georgia Tech':     2,
  'North Carolina':   4,
  'Florida State':    7,
  'Wake Forest':      20,
  'Virginia':         25,
  'Miami':            29,
  'Boston College':   34,
  'Pittsburgh':       38,
  'Virginia Tech':    43,
  'Clemson':          50,
  'NC State':         51,
  'Notre Dame':       70,
  'Duke':             82,
  'Louisville':       87,
  'California':       59,
  'Stanford':         101,

  // ── Big Ten ───────────────────────────────────────────────────────────────
  'Nebraska':         9,
  'Oregon':           16,
  'Oregon State':     18,
  'Purdue':           52,
  'Michigan':         53,
  'Iowa':             72,
  'Maryland':         83,
  'Ohio State':       84,
  'USC':              8,
  'Minnesota':        92,
  'Illinois':         98,
  'Michigan State':   106,
  'Indiana':          121,
  'Rutgers':          123,
  'Penn State':       155,
  'Washington':       158,
  'Northwestern':     160,

  // ── Big 12 ────────────────────────────────────────────────────────────────
  'West Virginia':    15,
  'Kansas':           19,
  'Cincinnati':       23,
  'Oklahoma State':   30,
  'UCF':              33,
  'TCU':              48,
  'Arizona State':    47,
  'Kansas State':     55,
  'Baylor':           65,
  'BYU':              78,
  'Houston':          108,
  'Texas Tech':       128,
  'Utah':             102,
  'Arizona':          165,

  // ── Pac-12 (former Pac-12 holdovers + former MWC) ─────────────────────────
  'Washington State': 85,
  'San Diego State':  91,
  'Air Force':        140,
  'Nevada':           166,
  'UNLV':             175,
  'Fresno State':     178,
  'New Mexico':       180,

  // ── AAC ──────────────────────────────────────────────────────────────────
  'East Carolina':    42,
  'South Florida':    77,
  'Rice':             76,
  'Dallas Baptist':   71,
  'UAB':              61,
  'Charlotte':        95,
  'Florida Atlantic': 127,
  'Memphis':          111,
  'Tulane':           146,
  'Wichita State':    147,
  'North Texas':      185,

  // ── Sun Belt ──────────────────────────────────────────────────────────────
  'Coastal Carolina': 26,
  'Southern Miss':    12,
  'Troy':             41,
  'Louisiana':        36,
  'Arkansas State':   60,
  'South Alabama':    62,
  'App State':        114,
  'Old Dominion':     115,
  'Georgia State':    130,
  'Marshall':         155,
  'Georgia Southern': 165,
  'James Madison':    170,

  // ── WCC ───────────────────────────────────────────────────────────────────
  'Gonzaga':          57,
  'Portland':         119,
  "Saint Mary's":     136,
  'San Diego':        183,
  'Pepperdine':       175,
  'Santa Clara':      185,
  'Loyola Marymount': 188,
  'San Francisco':    190,

  // ── Big West ──────────────────────────────────────────────────────────────
  'UC Santa Barbara': 35,
  'Cal Poly':         74,
  'UC San Diego':     103,
  'Cal State Fullerton': 117,
  'UC Irvine':        125,
  'Hawaii':           132,
  'UC Davis':         145,
  'Long Beach State': 155,
  'Cal State Northridge': 190,
  'Cal State Bakersfield': 195,

  // ── Missouri Valley ───────────────────────────────────────────────────────
  'Creighton':        163,
  'Missouri State':   175,
  'Indiana State':    180,
  'Illinois State':   183,
  'Southern Illinois':186,
  'Northern Iowa':    187,
  'UIC':              188,
  'Murray State':     190,
  'Valparaiso':       191,
  'Bradley':          192,
  'Belmont':          193,
  'Evansville':       194,
  'Western Illinois': 196,

  // ── Ivy League ────────────────────────────────────────────────────────────
  'Yale':             142,
  'Penn':             170,
  'Columbia':         175,
  'Cornell':          177,
  'Dartmouth':        180,
  'Harvard':          183,
  'Princeton':        185,
  'Brown':            187,

  // ── HBCU ─────────────────────────────────────────────────────────────────
  'Florida A&M':           186,
  'North Carolina A&T':    188,
  'Prairie View A&M':      190,
  'Bethune-Cookman':       192,
  'Alabama State':         193,
  'Southern University':   194,
  'Jackson State':         195,
  'Grambling State':       196,
  'Texas Southern':        197,
  'Howard':                198,
  'Norfolk State':         199,
  'Alcorn State':          200,
  'North Carolina Central':201,
  'Delaware State':        202,
  'Coppin State':          203,
  'Maryland Eastern Shore':204,
};

// ── Conference → Teams map for intra-conference multiplier ───────────────────
export const CONF_TEAMS: Record<string, string[]> = {
  'SEC': ['LSU','Florida','Vanderbilt','Texas A&M','Tennessee','Ole Miss','Arkansas','Alabama','Auburn','Georgia','Mississippi State','South Carolina','Kentucky','Missouri','Oklahoma','Texas'],
  'ACC': ['Clemson','Duke','Florida State','Georgia Tech','Louisville','Miami','NC State','North Carolina','Notre Dame','Pittsburgh','California','Stanford','Virginia','Virginia Tech','Wake Forest','Boston College'],
  'Big Ten': ['Illinois','Indiana','Iowa','Maryland','Michigan','Michigan State','Minnesota','Nebraska','Northwestern','Ohio State','Oregon','Penn State','Purdue','Rutgers','USC','UCLA','Washington'],
  'Big 12': ['Kansas','West Virginia','Arizona State','Arizona','Baylor','BYU','Cincinnati','Houston','Kansas State','Oklahoma State','TCU','Texas Tech','UCF','Utah'],
  'Pac-12': ['Oregon State','Washington State','Fresno State','San Diego State','UNLV','Nevada','New Mexico','Air Force'],
  'AAC': ['East Carolina','Wichita State','Tulane','Memphis','South Florida','Charlotte','UAB','Rice','Florida Atlantic','North Texas','Dallas Baptist'],
  'Sun Belt': ['Coastal Carolina','Southern Miss','Troy','Marshall','Louisiana','Old Dominion','Arkansas State','Georgia Southern','App State','Georgia State','South Alabama','James Madison'],
  'WCC': ['Pepperdine','Loyola Marymount','San Diego',"Saint Mary's",'Gonzaga','Santa Clara','Portland','San Francisco'],
  'Big West': ['Cal State Fullerton','Long Beach State','UC Irvine','UC Santa Barbara','UC San Diego','Hawaii','Cal Poly','UC Davis','Cal State Northridge','Cal State Bakersfield'],
  'Missouri Valley': ['Missouri State','Indiana State','Illinois State','Southern Illinois','Bradley','Evansville','Valparaiso','UIC','Belmont','Murray State','Western Illinois','Northern Iowa','Creighton'],
  'Ivy League': ['Columbia','Cornell','Dartmouth','Harvard','Penn','Princeton','Yale','Brown'],
  'HBCU': ['Grambling State','Southern University','Florida A&M','Bethune-Cookman','Jackson State','North Carolina A&T','Alabama State','Norfolk State','Alcorn State','Prairie View A&M','Texas Southern','Howard','Delaware State','Coppin State','North Carolina Central','Maryland Eastern Shore'],
};

// ── OVR target formula ────────────────────────────────────────────────────────
export function getTargetOvr(rank: number): number {
  return Math.round(420 - (rank - 1) * (120 / 148));
}

// ── Conference midpoint OVR (for intra-conference multiplier) ────────────────
export function getConferenceMidpointOvr(conferenceName: string): number {
  const confTeams = CONF_TEAMS[conferenceName];
  if (!confTeams || confTeams.length === 0) return 350;

  let total = 0;
  let count = 0;
  for (const t of confTeams) {
    const rank = RPI_RANK_MAP[t] ?? 185;
    total += getTargetOvr(rank);
    count++;
  }
  return Math.round(total / count);
}

// ── RPI intra-conference multiplier for a specific team ──────────────────────
export function getRpiMultiplier(teamName: string, conferenceName: string): number {
  const rank = RPI_RANK_MAP[teamName];
  if (rank == null) return 1.0;
  const targetOvr = getTargetOvr(rank);
  const midpoint = getConferenceMidpointOvr(conferenceName);
  if (midpoint === 0) return 1.0;
  return targetOvr / midpoint;
}

// ── Numeric attributes that feed into OVR ────────────────────────────────────
const NUMERIC_ATTRS = [
  'velocity', 'control', 'stamina', 'stuff',
  'hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance',
  'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing',
  'recovery', 'wRISP', 'vsLefty', 'poise', 'heater', 'agile',
] as const;

type NumericAttrKey = typeof NUMERIC_ATTRS[number];

interface CalibrationResult {
  teamName: string;
  rpiRank: number;
  targetAvgOvr: number;
  oldAvgOvr: number;
  newAvgOvr: number;
  playersAdjusted: number;
}

interface CalibrationSummary {
  leaguesProcessed: number;
  teamsProcessed: number;
  teamsSkipped: number;
  playersUpdated: number;
  results: CalibrationResult[];
}

export async function calibrateRpiOvr(dryRun = false): Promise<CalibrationSummary> {
  const summary: CalibrationSummary = {
    leaguesProcessed: 0,
    teamsProcessed: 0,
    teamsSkipped: 0,
    playersUpdated: 0,
    results: [],
  };

  // Load all leagues
  const allLeagues = await db.select({ id: leagues.id }).from(leagues);
  summary.leaguesProcessed = allLeagues.length;

  for (const league of allLeagues) {
    // Load teams for this league
    const leagueTeams = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.leagueId, league.id));

    for (const team of leagueTeams) {
      const rpiRank = RPI_RANK_MAP[team.name];

      if (rpiRank == null) {
        // Team not in rank map — skip with a warning
        console.warn(`[calibrate-rpi] Unknown team "${team.name}" — skipping`);
        summary.teamsSkipped++;
        continue;
      }

      const targetAvgOvr = getTargetOvr(rpiRank);

      // Load all players for this team ordered by overall desc
      const teamPlayers = await db
        .select()
        .from(players)
        .where(eq(players.teamId, team.id));

      if (teamPlayers.length === 0) {
        summary.teamsSkipped++;
        continue;
      }

      // Sort descending by overall
      teamPlayers.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

      const top5 = teamPlayers.slice(0, 5);
      const bottom20 = teamPlayers.slice(5);

      if (bottom20.length === 0) {
        summary.teamsSkipped++;
        continue;
      }

      const top5Sum = top5.reduce((s, p) => s + (p.overall ?? 0), 0);
      const currentBottom20Avg = bottom20.reduce((s, p) => s + (p.overall ?? 0), 0) / bottom20.length;
      const oldAvgOvr = Math.round(teamPlayers.reduce((s, p) => s + (p.overall ?? 0), 0) / teamPlayers.length);

      // Required average for bottom 20 so full-team avg = targetAvgOvr
      const requiredBottom20Avg = (targetAvgOvr * teamPlayers.length - top5Sum) / bottom20.length;

      // Clamp requiredBottom20Avg to sane bounds
      const clampedRequired = Math.max(155, Math.min(450, requiredBottom20Avg));

      // Scale ratio for bottom 20
      const ratio = currentBottom20Avg > 0 ? clampedRequired / currentBottom20Avg : 1.0;

      const updatesNeeded: Array<{ id: string; data: Record<string, number> }> = [];

      for (const player of bottom20) {
        const currentOvr = player.overall ?? 0;
        if (currentOvr === 0) continue;

        const rawNewOvr = Math.round(currentOvr * ratio);
        const newOvr = Math.max(150, Math.min(650, rawNewOvr));
        const newStarRating = getStarRatingFromOVR(newOvr);

        // Scale all numeric attributes by the same ratio applied to OVR
        const attrRatio = newOvr / (currentOvr || 1);
        const attrUpdates: Record<string, number> = {
          overall: newOvr,
          starRating: newStarRating,
        };

        for (const attr of NUMERIC_ATTRS) {
          const raw = (player as Record<string, unknown>)[attr];
          const currentVal = typeof raw === 'number' ? raw : 50;
          const newVal = Math.max(1, Math.min(99, Math.round(currentVal * attrRatio)));
          attrUpdates[attr] = newVal;
        }

        // Only update if OVR actually changed by more than 1 point
        if (Math.abs(newOvr - currentOvr) > 1) {
          updatesNeeded.push({ id: player.id, data: attrUpdates });
        }
      }

      // Calculate new team average
      const bottom20NewOvrs = bottom20.map((p) => {
        const update = updatesNeeded.find((u) => u.id === p.id);
        return update ? (update.data.overall as number) : (p.overall ?? 0);
      });
      const allOvrs = [...top5.map((p) => p.overall ?? 0), ...bottom20NewOvrs];
      const newAvgOvr = Math.round(allOvrs.reduce((s, v) => s + v, 0) / allOvrs.length);

      summary.results.push({
        teamName: team.name,
        rpiRank,
        targetAvgOvr,
        oldAvgOvr,
        newAvgOvr,
        playersAdjusted: updatesNeeded.length,
      });

      if (!dryRun && updatesNeeded.length > 0) {
        // Batch-update players
        for (const { id, data } of updatesNeeded) {
          await db.update(players).set(data).where(eq(players.id, id));
        }
        summary.playersUpdated += updatesNeeded.length;
      }

      summary.teamsProcessed++;
    }
  }

  return summary;
}
