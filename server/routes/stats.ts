/**
 * Stats and historical data routes.
 *
 * Endpoints:
 *   - GET /api/leagues/:id/record-book         — all-time record book
 *   - GET /api/leagues/:id/player-history       — departed/transferred player history
 *   - GET /api/leagues/:id/signing-day          — signing day summary
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireLeagueMember } from "../route-helpers";

export function registerStatsRoutes(app: Express): void {
  // ─── Record Book ────────────────────────────────────────────────────────────
  app.get("/api/leagues/:id/record-book", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [teams, allStandings, allPlayerHistory, allSeasonStats, allCoaches, coachHistory, recruitingSnaps, allGames] =
        await Promise.all([
          storage.getTeamsByLeague(leagueId),
          storage.getAllStandingsByLeague(leagueId),
          storage.getPlayerHistoryByLeague(leagueId),
          storage.getAllPlayerSeasonStatsByLeague(leagueId),
          storage.getCoachesByLeague(leagueId),
          storage.getCoachSeasonHistoryByLeague(leagueId),
          storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
          storage.getGamesByLeague(leagueId),
        ]);

      const teamMap = new Map(teams.map(t => [t.id, t]));

      // ── Season History ──────────────────────────────────────────────────────
      const seasonNums = Array.from(new Set(allStandings.map(s => s.season))).sort((a, b) => b - a);

      const gradeFromScore = (score: number | null) => {
        if (score === null) return null;
        if (score >= 95) return "A+";
        if (score >= 88) return "A";
        if (score >= 80) return "A-";
        if (score >= 72) return "B+";
        if (score >= 65) return "B";
        if (score >= 58) return "B-";
        if (score >= 50) return "C+";
        if (score >= 42) return "C";
        return "C-";
      };

      const seasonHistory = seasonNums.map(season => {
        const seasonStandings = allStandings.filter(s => s.season === season);
        const sorted = [...seasonStandings].sort((a, b) => {
          const awPct = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
          const bwPct = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
          return bwPct - awPct;
        });

        // Determine CWS champion/runner-up from game results (most accurate)
        const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
        let cwsChampionId: string | null = null;
        let cwsRunnerUpId: string | null = null;
        if (cwsGames.length >= 2) {
          const winsMap: Record<string, number> = {};
          for (const g of cwsGames) {
            const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            winsMap[winnerId] = (winsMap[winnerId] || 0) + 1;
          }
          cwsChampionId = Object.entries(winsMap).find(([_, w]) => w >= 2)?.[0] ?? null;
          const otherIds = Object.keys(winsMap).filter(id => id !== cwsChampionId);
          cwsRunnerUpId = otherIds.length > 0 ? otherIds[0] : null;
        }

        // Fall back to standings leader if no CWS game data
        const champTeamId = cwsChampionId ?? (sorted[0]?.teamId ?? null);
        const runnerUpTeamId = cwsRunnerUpId ?? (sorted[1]?.teamId ?? null);
        const champTeam = champTeamId ? teamMap.get(champTeamId) : null;
        const ruTeam = runnerUpTeamId ? teamMap.get(runnerUpTeamId) : null;
        const champStandings = seasonStandings.find(s => s.teamId === champTeamId);
        const ruStandings = seasonStandings.find(s => s.teamId === runnerUpTeamId);

        // conf champions from conference_championship game results
        const confChampGames = allGames.filter(g => g.phase === "conference_championship" && g.season === season && g.isComplete);
        const confChamps: { teamId: string; teamName: string; confId: string | null }[] = [];
        if (confChampGames.length > 0) {
          for (const g of confChampGames) {
            const winnerId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            const t = teamMap.get(winnerId);
            if (t) confChamps.push({ teamId: winnerId, teamName: t.name, confId: t.conferenceId ?? null });
          }
        } else {
          // Fall back to standings-based conf leaders
          const seen = new Set<string | null>();
          for (const s of sorted) {
            const t = teamMap.get(s.teamId);
            const confId = t?.conferenceId ?? null;
            if (!seen.has(confId)) {
              seen.add(confId);
              confChamps.push({ teamId: s.teamId, teamName: t?.name ?? "", confId });
            }
          }
        }

        // stat leaders for the season from player_season_stats
        const seasonStats = allSeasonStats.filter(p => p.season === season);
        const batters = seasonStats.filter(p => p.ab >= 10);
        const pitchers = seasonStats.filter(p => p.ipOuts >= 3);

        const hrLeader = batters.length ? batters.reduce((best, p) => p.hr > best.hr ? p : best) : null;
        const avgLeader = batters.length ? batters.reduce((best, p) => {
          const avg = p.ab > 0 ? p.h / p.ab : 0;
          const bAvg = best.ab > 0 ? best.h / best.ab : 0;
          return avg > bAvg ? p : best;
        }) : null;
        const eraLeader = pitchers.length ? pitchers.reduce((best, p) => {
          const era = p.ipOuts > 0 ? (p.pEr * 27) / p.ipOuts : 99;
          const bEra = best.ipOuts > 0 ? (best.pEr * 27) / best.ipOuts : 99;
          return era < bEra ? p : best;
        }) : null;

        // recruiting class grade for this season (avg classScore normalized to letter)
        const snapshots = recruitingSnaps.filter(s => s.season === season);
        const avgScore = snapshots.length ? snapshots.reduce((sum, s) => sum + s.classScore, 0) / snapshots.length : null;

        return {
          season,
          championTeamId: champTeam?.id ?? null,
          championName: champTeam?.name ?? null,
          championW: champStandings?.wins ?? 0,
          championL: champStandings?.losses ?? 0,
          runnerUpName: ruTeam?.name ?? null,
          runnerUpW: ruStandings?.wins ?? 0,
          runnerUpL: ruStandings?.losses ?? 0,
          isCwsChampion: cwsChampionId !== null,
          confChampions: confChamps,
          hrLeader: hrLeader ? { name: hrLeader.playerName, value: hrLeader.hr, teamId: hrLeader.teamId, playerId: hrLeader.playerId } : null,
          avgLeader: avgLeader ? {
            name: avgLeader.playerName,
            value: avgLeader.ab > 0 ? (avgLeader.h / avgLeader.ab).toFixed(3) : ".000",
            teamId: avgLeader.teamId, playerId: avgLeader.playerId,
          } : null,
          eraLeader: eraLeader ? {
            name: eraLeader.playerName,
            value: eraLeader.ipOuts > 0 ? ((eraLeader.pEr * 27) / eraLeader.ipOuts).toFixed(2) : "0.00",
            teamId: eraLeader.teamId, playerId: eraLeader.playerId,
          } : null,
          recruitingGrade: gradeFromScore(avgScore),
          winsLeader: sorted[0] ? {
            name: teamMap.get(sorted[0].teamId)?.name ?? "",
            teamId: sorted[0].teamId,
            wins: sorted[0].wins,
            losses: sorted[0].losses,
          } : null,
        };
      });

      // ── Career Batting Leaders (aggregated from player_season_stats) ─────────
      const battersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; ab: number; h: number; hr: number; rbi: number; bb: number;
        hbp: number; doubles: number; triples: number; so: number;
      }>();
      for (const row of allSeasonStats) {
        const PITCHER_POS = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
        if (PITCHER_POS.includes(row.position)) continue;
        const key = row.playerId;
        if (!battersByPlayer.has(key)) {
          battersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0,
            hbp: 0, doubles: 0, triples: 0, so: 0,
          });
        }
        const agg = battersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.games;
        agg.ab += row.ab;
        agg.h += row.h;
        agg.hr += row.hr;
        agg.rbi += row.rbi;
        agg.bb += row.bb;
        agg.hbp += row.hbp;
        agg.doubles += row.doubles;
        agg.triples += row.triples;
        agg.so += row.so;
        // Keep most recent team
        agg.teamId = row.teamId;
      }

      // Build last season per player (for graduation year filter)
      const playerLastSeason = new Map<string, number>();
      for (const row of allSeasonStats) {
        const cur = playerLastSeason.get(row.playerId);
        if (cur === undefined || row.season > cur) playerLastSeason.set(row.playerId, row.season);
      }

      const careerBatting = Array.from(battersByPlayer.values())
        .filter(b => b.ab >= 10)
        .map(b => {
          const avg = b.ab > 0 ? b.h / b.ab : 0;
          const obp = (b.ab + b.bb + b.hbp) > 0 ? (b.h + b.bb + b.hbp) / (b.ab + b.bb + b.hbp) : 0;
          const singles = b.h - b.doubles - b.triples - b.hr;
          const tb = singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
          const slg = b.ab > 0 ? tb / b.ab : 0;
          const ops = obp + slg;
          const wOBA = (b.ab + b.bb + b.hbp) > 0
            ? (0.69 * b.bb + 0.72 * b.hbp + 0.89 * singles + 1.27 * b.doubles + 1.62 * b.triples + 2.10 * b.hr) / (b.ab + b.bb + b.hbp)
            : 0;
          const wRAA = ((wOBA - 0.320) / 1.25) * (b.ab + b.bb + b.hbp);
          const war = wRAA / 10;
          const team = teamMap.get(b.teamId);
          // Status: check if player_history has a matching record for this playerId
          const phRecord = allPlayerHistory.find(ph => `${ph.firstName} ${ph.lastName}` === b.name && ph.teamId === b.teamId);
          const status: string = phRecord ? (phRecord.departureType === "drafted" || phRecord.departureType === "declared" ? "drafted" : "graduated") : "active";
          return {
            playerId: b.playerId, name: b.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: b.position, seasons: b.seasons,
            games: b.games, ab: b.ab, avg: avg.toFixed(3), hr: b.hr, rbi: b.rbi,
            ops: ops.toFixed(3), war: war.toFixed(1), status,
            lastSeason: playerLastSeason.get(b.playerId) ?? 0,
          };
        })
        .sort((a, b) => parseFloat(b.war) - parseFloat(a.war));
      // No .slice — return full list so client can accurately sort by any metric

      // ── Career Pitching Leaders ──────────────────────────────────────────────
      const pitchersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; wins: number; losses: number; ipOuts: number;
        pEr: number; pHits: number; pBb: number; pSo: number;
      }>();
      const PITCHER_POSITIONS = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
      for (const row of allSeasonStats) {
        if (!PITCHER_POSITIONS.includes(row.position) && row.ipOuts < 3) continue;
        if (row.ipOuts < 3) continue;
        const key = row.playerId;
        if (!pitchersByPlayer.has(key)) {
          pitchersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, wins: 0, losses: 0, ipOuts: 0, pEr: 0, pHits: 0, pBb: 0, pSo: 0,
          });
        }
        const agg = pitchersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.pitchingGames;
        agg.wins += row.wins;
        agg.losses += row.losses;
        agg.ipOuts += row.ipOuts;
        agg.pEr += row.pEr;
        agg.pHits += row.pHits;
        agg.pBb += row.pBb;
        agg.pSo += row.pSo;
        agg.teamId = row.teamId;
      }

      const careerPitching = Array.from(pitchersByPlayer.values())
        .filter(p => p.ipOuts >= 9)
        .map(p => {
          const ip = p.ipOuts / 3;
          const era = ip > 0 ? (p.pEr * 9) / ip : 99;
          const whip = ip > 0 ? (p.pBb + p.pHits) / ip : 99;
          const team = teamMap.get(p.teamId);
          const war = Math.max(0, (4.0 - era) * ip / 9);
          const phRecord = allPlayerHistory.find(ph => `${ph.firstName} ${ph.lastName}` === p.name && ph.teamId === p.teamId);
          const status: string = phRecord ? (phRecord.departureType === "drafted" || phRecord.departureType === "declared" ? "drafted" : "graduated") : "active";
          return {
            playerId: p.playerId, name: p.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: p.position, seasons: p.seasons,
            games: p.games, wins: p.wins, losses: p.losses,
            ip: ip.toFixed(1), era: era.toFixed(2), whip: whip.toFixed(2), so: p.pSo, war: war.toFixed(1), status,
            lastSeason: playerLastSeason.get(p.playerId) ?? 0,
          };
        })
        .sort((a, b) => parseFloat(a.era) - parseFloat(b.era));
      // No .slice — return full list so client can accurately sort by any metric

      // ── All-Time Team Records ────────────────────────────────────────────────
      const teamRecordsMap = new Map<string, {
        teamId: string; w: number; l: number; championships: number; postseasonApps: number; bestSeasonW: number;
      }>();
      for (const s of allStandings) {
        if (!teamRecordsMap.has(s.teamId)) {
          teamRecordsMap.set(s.teamId, { teamId: s.teamId, w: 0, l: 0, championships: 0, postseasonApps: 0, bestSeasonW: 0 });
        }
        const rec = teamRecordsMap.get(s.teamId)!;
        rec.w += s.wins;
        rec.l += s.losses;
        if (s.wins > rec.bestSeasonW) rec.bestSeasonW = s.wins;
      }

      // Mark CWS champions from season history
      for (const sh of seasonHistory) {
        if (sh.championTeamId && teamRecordsMap.has(sh.championTeamId)) {
          teamRecordsMap.get(sh.championTeamId)!.championships++;
        }
      }

      // Count postseason appearances per team (super_regionals or CWS)
      const postseasonTeamSet = new Map<string, Set<number>>();
      for (const g of allGames) {
        if (g.phase !== "super_regionals" && g.phase !== "cws") continue;
        const addTeam = (tid: string | null) => {
          if (!tid) return;
          if (!postseasonTeamSet.has(tid)) postseasonTeamSet.set(tid, new Set());
          postseasonTeamSet.get(tid)!.add(g.season);
        };
        addTeam(g.homeTeamId);
        addTeam(g.awayTeamId);
      }
      for (const [tid, seasons] of Array.from(postseasonTeamSet)) {
        if (teamRecordsMap.has(tid)) {
          teamRecordsMap.get(tid)!.postseasonApps = seasons.size;
        }
      }

      // Count all-time 5-star recruits per team
      const fiveStarByTeam = new Map<string, number>();
      for (const snap of recruitingSnaps) {
        fiveStarByTeam.set(snap.teamId, (fiveStarByTeam.get(snap.teamId) ?? 0) + (snap.fiveStars ?? 0));
      }

      const teamRecords = Array.from(teamRecordsMap.values()).map(rec => {
        const t = teamMap.get(rec.teamId);
        const pct = (rec.w + rec.l) > 0 ? rec.w / (rec.w + rec.l) : 0;
        return {
          teamId: rec.teamId, teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "",
          teamColor: t?.primaryColor ?? "#888",
          allTimeW: rec.w, allTimeL: rec.l, pct: pct.toFixed(3),
          championships: rec.championships, bestSeasonW: rec.bestSeasonW,
          postseasonApps: rec.postseasonApps,
          allTimeFiveStars: fiveStarByTeam.get(rec.teamId) ?? 0,
        };
      }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));

      // ── Coach Career Stats ──────────────────────────────────────────────────
      const coachStats = allCoaches.map(coach => {
        const history = coachHistory.filter(h => h.coachId === coach.id);
        const totalW = history.reduce((s, h) => s + h.wins, 0);
        const totalL = history.reduce((s, h) => s + h.losses, 0);
        const pct = (totalW + totalL) > 0 ? totalW / (totalW + totalL) : 0;
        const teamsCoached = Array.from(new Set(history.map(h => h.teamName).filter(Boolean)));
        const team = coach.teamId ? teamMap.get(coach.teamId) : null;
        return {
          coachId: coach.id,
          name: `${coach.firstName} ${coach.lastName}`,
          archetype: coach.archetype,
          teamName: team?.name ?? "",
          teamAbbr: team?.abbreviation ?? "",
          teamColor: team?.primaryColor ?? "#888",
          seasons: history.length,
          w: totalW, l: totalL, pct: pct.toFixed(3),
          championships: coach.nationalChampionships,
          confChampionships: coach.confChampionships,
          cwsAppearances: coach.cwsAppearances,
          legacyScore: coach.legacyScore,
          teamsCoached,
        };
      }).sort((a, b) => b.legacyScore - a.legacyScore);

      // ── Recruiting History ──────────────────────────────────────────────────
      // Build first-season per player (for signed class derivation from stats)
      const playerTeamFirstSeason = new Map<string, { season: number; name: string; position: string; teamId: string }>();
      for (const row of [...allSeasonStats].sort((a, b) => a.season - b.season)) {
        if (!playerTeamFirstSeason.has(row.playerId)) {
          playerTeamFirstSeason.set(row.playerId, { season: row.season, name: row.playerName, position: row.position, teamId: row.teamId });
        }
      }
      // Group signed class by season+team
      const signedClassBySeason = new Map<number, Map<string, { name: string; position: string }[]>>();
      for (const data of Array.from(playerTeamFirstSeason.values())) {
        if (!signedClassBySeason.has(data.season)) signedClassBySeason.set(data.season, new Map());
        const teamMap2 = signedClassBySeason.get(data.season)!;
        if (!teamMap2.has(data.teamId)) teamMap2.set(data.teamId, []);
        teamMap2.get(data.teamId)!.push({ name: data.name, position: data.position });
      }

      const recruitingSeasons = Array.from(new Set(recruitingSnaps.map(s => s.season))).sort((a, b) => b - a);
      const recruitingHistory = recruitingSeasons.map(season => {
        const snaps = recruitingSnaps.filter(s => s.season === season)
          .sort((a, b) => a.classRank - b.classRank);
        const seasonSignedClass = signedClassBySeason.get(season);
        return {
          season,
          snapshots: snaps.map(s => {
            const t = teamMap.get(s.teamId);
            const gradeFromScore2 = (score: number) => {
              if (score >= 95) return "A+";
              if (score >= 88) return "A";
              if (score >= 80) return "A-";
              if (score >= 72) return "B+";
              if (score >= 65) return "B";
              if (score >= 58) return "B-";
              if (score >= 50) return "C+";
              if (score >= 42) return "C";
              return "C-";
            };
            return {
              teamId: s.teamId, teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "",
              teamColor: t?.primaryColor ?? "#888", classRank: s.classRank,
              grade: gradeFromScore2(s.classScore), classScore: s.classScore,
              totalCommits: s.totalCommits, fiveStars: s.fiveStars, fourStars: s.fourStars,
              topRecruitName: s.topRecruitName, topRecruitOvr: s.topRecruitOvr, topRecruitStars: s.topRecruitStars,
              signedPlayers: (seasonSignedClass?.get(s.teamId) ?? []).sort((a, b) => a.position.localeCompare(b.position)),
            };
          }),
        };
      });

      // ── Career Fielding Leaders ──────────────────────────────────────────────
      const fieldersByPlayer = new Map<string, {
        playerId: string; name: string; teamId: string; position: string;
        seasons: number; games: number; putouts: number; assists: number;
        errors: number; totalChances: number;
      }>();
      for (const row of allSeasonStats) {
        if ((row.putouts + row.assists + row.fieldingErrors + row.totalChances) === 0) continue;
        const key = row.playerId;
        if (!fieldersByPlayer.has(key)) {
          fieldersByPlayer.set(key, {
            playerId: row.playerId, name: row.playerName, teamId: row.teamId, position: row.position,
            seasons: 0, games: 0, putouts: 0, assists: 0, errors: 0, totalChances: 0,
          });
        }
        const agg = fieldersByPlayer.get(key)!;
        agg.seasons++;
        agg.games += row.games;
        agg.putouts += row.putouts;
        agg.assists += row.assists;
        agg.errors += row.fieldingErrors;
        agg.totalChances += row.totalChances;
        agg.teamId = row.teamId;
      }

      const careerFielding = Array.from(fieldersByPlayer.values())
        .filter(f => f.totalChances >= 10)
        .map(f => {
          const fldPct = f.totalChances > 0 ? ((f.totalChances - f.errors) / f.totalChances) : 1.0;
          const oaa = f.putouts + f.assists - Math.round(f.totalChances * 0.95);
          const team = teamMap.get(f.teamId);
          return {
            playerId: f.playerId, name: f.name, teamName: team?.name ?? "", teamAbbr: team?.abbreviation ?? "",
            teamColor: team?.primaryColor ?? "#888", position: f.position, seasons: f.seasons,
            games: f.games, putouts: f.putouts, assists: f.assists, errors: f.errors,
            totalChances: f.totalChances, fldPct: fldPct.toFixed(3), oaa,
          };
        })
        .sort((a, b) => parseFloat(b.fldPct) - parseFloat(a.fldPct))
        .slice(0, 25);

      // ── Hall of Fame ────────────────────────────────────────────────────────
      // Build career WAR map keyed by playerId (correct aggregation, handles transfers)
      const PITCHER_POS_HOF = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
      const careerWarById = new Map<string, number>();
      for (const row of allSeasonStats) {
        let war = 0;
        if (PITCHER_POS_HOF.includes(row.position)) {
          const ip = row.ipOuts / 3;
          war = Math.max(0, (4.0 - (ip > 0 ? (row.pEr * 9) / ip : 99)) * ip / 9);
        } else {
          const singles = row.h - row.doubles - row.triples - row.hr;
          const wOBA = (row.ab + row.bb + row.hbp) > 0
            ? (0.69 * row.bb + 0.72 * row.hbp + 0.89 * singles + 1.27 * row.doubles + 1.62 * row.triples + 2.10 * row.hr) / (row.ab + row.bb + row.hbp)
            : 0;
          war = ((wOBA - 0.320) / 1.25) * (row.ab + row.bb + row.hbp) / 10;
        }
        careerWarById.set(row.playerId, (careerWarById.get(row.playerId) ?? 0) + war);
      }

      // Build lookup: playerName|teamId -> most recent playerId (for history-to-stats linkage)
      // We sort by season desc so the "latest" playerId wins if a player changed name
      const nameTeamToPlayerId = new Map<string, string>();
      for (const row of [...allSeasonStats].sort((a, b) => a.season - b.season)) {
        nameTeamToPlayerId.set(`${row.playerName}|${row.teamId}`, row.playerId);
      }

      const DEPARTURES_HOF = new Set(["graduated", "drafted", "declared"]);

      // Helper: resolve the playerId for a player_history record.
      // Prefer the stored sourcePlayerId (direct FK, always correct), then fall back to
      // the name+teamId string match for legacy records that predate this field.
      const resolveHofPlayerId = (p: typeof allPlayerHistory[0]): string | undefined => {
        if (p.sourcePlayerId) return p.sourcePlayerId;
        const pName = `${p.firstName} ${p.lastName}`;
        return nameTeamToPlayerId.get(`${pName}|${p.teamId}`);
      };

      const hofEligible = allPlayerHistory.filter(p => {
        if (!DEPARTURES_HOF.has(p.departureType ?? "")) return false;
        const resolvedPlayerId = resolveHofPlayerId(p);
        const careerWar = resolvedPlayerId ? (careerWarById.get(resolvedPlayerId) ?? 0) : 0;
        return p.overall >= 400 || careerWar >= 2;
      });

      const hallOfFame = hofEligible.map(p => {
        const t = teamMap.get(p.teamId);
        const pName = `${p.firstName} ${p.lastName}`;
        const PITCHER_POS2 = ["P", "SP", "RP", "CP", "CL", "LHP", "RHP"];
        const resolvedPlayerId = resolveHofPlayerId(p);
        const careerWar = resolvedPlayerId ? (careerWarById.get(resolvedPlayerId) ?? 0) : 0;
        const playerStats = resolvedPlayerId
          ? allSeasonStats.filter(s => s.playerId === resolvedPlayerId)
          : allSeasonStats.filter(s => s.playerName === pName && s.teamId === p.teamId);
        const bestSeason = playerStats.length ? playerStats.reduce((best, s) => {
          if (PITCHER_POS2.includes(p.position)) {
            const era = s.ipOuts > 0 ? (s.pEr * 27) / s.ipOuts : 99;
            const bEra = best.ipOuts > 0 ? (best.pEr * 27) / best.ipOuts : 99;
            return era < bEra ? s : best;
          }
          return s.hr > best.hr ? s : best;
        }) : null;
        const bestStatStr = bestSeason ? (PITCHER_POS2.includes(p.position)
          ? `${bestSeason.pSo} SO, ${((bestSeason.pEr * 27) / Math.max(bestSeason.ipOuts, 1)).toFixed(2)} ERA`
          : `${bestSeason.hr} HR, .${Math.round(bestSeason.ab > 0 ? bestSeason.h / bestSeason.ab * 1000 : 0).toString().padStart(3, "0")} AVG`
        ) : null;
        // Legacy score: OVR + careerWAR*5 + draft bonus
        const draftBonus = p.draftRound === 1 ? 30 : p.draftRound === 2 ? 20 : p.draftRound === 3 ? 10 : 0;
        const legacyScore = Math.round(p.overall + careerWar * 5 + draftBonus);
        return {
          id: p.id, name: pName, position: p.position,
          teamName: t?.name ?? "", teamAbbr: t?.abbreviation ?? "", teamColor: t?.primaryColor ?? "#888",
          overall: p.overall, starRating: p.starRating, seasonsPlayed: p.seasonsPlayed,
          departureType: p.departureType, draftRound: p.draftRound, departedSeason: p.departedSeason,
          abilities: p.abilities ?? [],
          bestSeasonStat: bestStatStr,
          careerWar: parseFloat(careerWar.toFixed(1)),
          legacyScore,
        };
      }).sort((a, b) => b.legacyScore - a.legacyScore).slice(0, 50);

      res.json({
        seasons: seasonHistory,
        careerBattingLeaders: careerBatting,
        careerPitchingLeaders: careerPitching,
        careerFieldingLeaders: careerFielding,
        teamRecords,
        coachStats,
        recruitingHistory,
        hallOfFame,
        meta: { currentSeason: league.currentSeason, totalSeasons: seasonNums.length },
      });
    } catch (error) {
      console.error("Failed to fetch record book:", error);
      res.status(500).json({ message: "Failed to fetch record book" });
    }
  });

  app.get("/api/leagues/:leagueId/players/:playerId/career-stats", requireAuth, requireLeagueMember, async (req, res) => {
    try {
      const rawStats = await storage.getPlayerSeasonStats(req.params.playerId as string, req.params.leagueId as string);
      const stats = [...rawStats].sort((a, b) => (a.season ?? 0) - (b.season ?? 0));

      const seasonStats = stats.map(s => {
        const ip = s.ipOuts / 3;
        const avg = s.ab > 0 ? (s.h / s.ab) : 0;
        const obp = (s.ab + s.bb + s.hbp) > 0 ? (s.h + s.bb + s.hbp) / (s.ab + s.bb + s.hbp) : 0;
        const singles = s.h - s.doubles - s.triples - s.hr;
        const totalBases = singles + s.doubles * 2 + s.triples * 3 + s.hr * 4;
        const slg = s.ab > 0 ? totalBases / s.ab : 0;
        const ops = obp + slg;
        const era = ip > 0 ? (s.pEr * 9) / ip : 0;
        const fip = ip > 0 ? ((13 * s.pHr + 3 * s.pBb - 2 * s.pSo) / ip) + 3.10 : 0;
        const whip = ip > 0 ? (s.pBb + s.pHits) / ip : 0;
        const babip = (s.ab - s.so - s.hr) > 0 ? (s.h - s.hr) / (s.ab - s.so - s.hr) : 0;
        const wOBA = (s.ab + s.bb + s.hbp) > 0
          ? (0.69 * s.bb + 0.72 * s.hbp + 0.89 * singles + 1.27 * s.doubles + 1.62 * s.triples + 2.10 * s.hr) / (s.ab + s.bb + s.hbp)
          : 0;
        const avgExitVelo = s.games > 0 ? s.exitVeloTotal / s.games : 0;
        const barrelPct = s.ballsInPlay > 0 ? (s.barrels / s.ballsInPlay) * 100 : 0;
        const hardHitPct = s.ballsInPlay > 0 ? (s.hardHits / s.ballsInPlay) * 100 : 0;
        const fldPct = s.totalChances > 0 ? (s.putouts + s.assists) / s.totalChances : 0;
        const bfApprox = Math.round(ip * 3 + s.pHits + s.pBb);
        const kPct = bfApprox > 0 ? (s.pSo / bfApprox) * 100 : 0;
        const whiffRate = s.totalPitches > 0 ? (s.whiffs / s.totalPitches) * 100 : 0;
        const avgSpinRate = s.pitchingGames > 0 ? Math.round(s.spinRateTotal / s.pitchingGames) : 0;

        return {
          season: s.season,
          teamId: s.teamId,
          position: s.position,
          endSeasonOvr: s.endSeasonOvr ?? null,
          games: s.games,
          ab: s.ab, r: s.r, h: s.h, doubles: s.doubles, triples: s.triples,
          hr: s.hr, rbi: s.rbi, bb: s.bb, hbp: s.hbp, so: s.so, sb: s.sb, cs: s.cs,
          avg: avg.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3), ops: ops.toFixed(3),
          babip: babip.toFixed(3), wOBA: wOBA.toFixed(3),
          avgExitVelo: avgExitVelo.toFixed(1), barrelPct: barrelPct.toFixed(1), hardHitPct: hardHitPct.toFixed(1),
          fldPct: fldPct.toFixed(3),
          pitchingGames: s.pitchingGames,
          wins: s.wins, losses: s.losses,
          ipDisplay: `${Math.floor(ip)}.${Math.round((ip % 1) * 3)}`,
          pHits: s.pHits, pRuns: s.pRuns, pEr: s.pEr, pBb: s.pBb, pSo: s.pSo, pHr: s.pHr,
          era: era.toFixed(2), fip: Math.max(0, fip).toFixed(2), whip: whip.toFixed(2),
          kPct: kPct.toFixed(1), whiffRate: whiffRate.toFixed(1), avgSpinRate,
        };
      });

      res.json({ playerId: req.params.playerId as string, leagueId: req.params.leagueId as string, seasons: seasonStats });
    } catch (error) {
      console.error("Failed to fetch career stats:", error);
      res.status(500).json({ message: "Failed to fetch career stats" });
    }
  });

  // Schedule routes

  // ============ PLAYER HISTORY API ============
  app.get("/api/leagues/:id/player-history", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const history = await storage.getPlayerHistoryByLeague(req.params.id as string);
      const teams = await storage.getTeamsByLeague(req.params.id as string);
      const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
      
      const enrichedHistory = history.map(h => ({
        ...h,
        teamName: teamMap[h.teamId]?.name || "Unknown",
        abbreviation: teamMap[h.teamId]?.abbreviation || "???",
        primaryColor: teamMap[h.teamId]?.primaryColor || "#666",
      }));
      
      res.json({ history: enrichedHistory });
    } catch (error) {
      console.error("Failed to fetch player history:", error);
      res.status(500).json({ message: "Failed to fetch player history" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // HISTORICAL ARCHIVE
  // ──────────────────────────────────────────────────────────────────────────

  function archiveGradeFromScore(score: number | null): string | null {
    if (score === null) return null;
    if (score >= 95) return "A+";
    if (score >= 88) return "A";
    if (score >= 80) return "A-";
    if (score >= 72) return "B+";
    if (score >= 65) return "B";
    if (score >= 58) return "B-";
    if (score >= 50) return "C+";
    if (score >= 42) return "C";
    return "C-";
  }

  // GET /api/leagues/:id/archive?season=N
  app.get("/api/leagues/:id/archive", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const [teams, confs, allCoaches, allStandings, allGames, allPlayerHistory,
             allSeasonStats, allCoachHistory, allRecruitSnaps, allRecaps] =
        await Promise.all([
          storage.getTeamsByLeague(leagueId),
          storage.getConferencesByLeague(leagueId),
          storage.getCoachesByLeague(leagueId),
          storage.getAllStandingsByLeague(leagueId),
          storage.getGamesByLeague(leagueId),
          storage.getPlayerHistoryByLeague(leagueId),
          storage.getAllPlayerSeasonStatsByLeague(leagueId),
          storage.getCoachSeasonHistoryByLeague(leagueId),
          storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
          storage.getGameRecapsByLeague(leagueId, 1000),
        ]);
      const coachMap = new Map(allCoaches.map(c => [c.id, c]));

      const teamMap = new Map(teams.map(t => [t.id, t]));
      const confMap = new Map(confs.map(c => [c.id, c]));

      // Available seasons = all seasons that have standings, sorted newest first
      const availableSeasons = Array.from(new Set(allStandings.map(s => s.season)))
        .sort((a, b) => b - a);

      // Default to most recent completed season (not current, or current if only one exists)
      const requestedSeason = req.query.season ? parseInt(req.query.season as string, 10) : null;
      const completedSeasons = availableSeasons.filter(s => s < league.currentSeason);
      const defaultSeason = completedSeasons[0] ?? availableSeasons[0];
      const selectedSeason = requestedSeason && availableSeasons.includes(requestedSeason)
        ? requestedSeason
        : defaultSeason;

      if (selectedSeason === undefined) {
        return res.json({ availableSeasons: [], selectedSeason: null, overview: null,
          recruitingSnapshots: [], departedStars: [], legendaryGames: [], teamStandings: [] });
      }

      // ── Champion & conf champs ──────────────────────────────────────────────
      const seasonStandings = allStandings.filter(s => s.season === selectedSeason);
      const sortedStandings = [...seasonStandings].sort((a, b) => {
        const aPct = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
        const bPct = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
        return bPct - aPct;
      });

      const cwsGames = allGames.filter(g => g.phase === "cws" && g.season === selectedSeason && g.isComplete);
      let cwsChampId: string | null = null;
      let cwsRunnerUpId: string | null = null;
      if (cwsGames.length >= 2) {
        const winsMap: Record<string, number> = {};
        for (const g of cwsGames) {
          const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          winsMap[wId] = (winsMap[wId] || 0) + 1;
        }
        cwsChampId = Object.entries(winsMap).find(([, w]) => w >= 2)?.[0] ?? null;
        const others = Object.keys(winsMap).filter(id => id !== cwsChampId);
        cwsRunnerUpId = others[0] ?? null;
      }
      const champId = cwsChampId ?? sortedStandings[0]?.teamId ?? null;
      const ruId = cwsRunnerUpId ?? sortedStandings[1]?.teamId ?? null;

      const makeTeamSummary = (teamId: string | null) => {
        if (!teamId) return null;
        const t = teamMap.get(teamId);
        const s = seasonStandings.find(x => x.teamId === teamId);
        return t ? {
          teamId: t.id, name: t.name, abbr: t.abbreviation,
          color: t.primaryColor, wins: s?.wins ?? 0, losses: s?.losses ?? 0,
        } : null;
      };

      const confChampGames = allGames.filter(g =>
        g.phase === "conference_championship" && g.season === selectedSeason && g.isComplete);
      const confChamps: { teamId: string; name: string; abbr: string; color: string; confName: string }[] = [];
      if (confChampGames.length > 0) {
        const seen = new Set<string>();
        for (const g of confChampGames) {
          const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
          if (seen.has(wId)) continue;
          seen.add(wId);
          const t = teamMap.get(wId);
          if (t) confChamps.push({
            teamId: wId, name: t.name, abbr: t.abbreviation,
            color: t.primaryColor,
            confName: confMap.get(t.conferenceId ?? "")?.name ?? "Unknown",
          });
        }
      } else {
        const seenConf = new Set<string | null>();
        for (const s of sortedStandings) {
          const t = teamMap.get(s.teamId);
          const cid = t?.conferenceId ?? null;
          if (seenConf.has(cid)) continue;
          seenConf.add(cid);
          if (t) confChamps.push({
            teamId: s.teamId, name: t.name, abbr: t.abbreviation,
            color: t.primaryColor,
            confName: confMap.get(cid ?? "")?.name ?? "Unknown",
          });
        }
      }

      // ── Stat leaders for this season ────────────────────────────────────────
      const seasonStats = allSeasonStats.filter(p => p.season === selectedSeason);
      const batters = seasonStats.filter(p => p.ab >= 10);
      const pitchers = seasonStats.filter(p => p.ipOuts >= 3);

      const hrLeaderRow = batters.length
        ? batters.reduce((b, p) => p.hr > b.hr ? p : b)
        : null;
      const avgLeaderRow = batters.length
        ? batters.reduce((b, p) => (p.ab > 0 ? p.h / p.ab : 0) > (b.ab > 0 ? b.h / b.ab : 0) ? p : b)
        : null;
      const eraLeaderRow = pitchers.length
        ? pitchers.reduce((b, p) => {
            const era = p.ipOuts > 0 ? (p.pEr * 27) / p.ipOuts : 99;
            const bEra = b.ipOuts > 0 ? (b.pEr * 27) / b.ipOuts : 99;
            return era < bEra ? p : b;
          })
        : null;
      const soLeaderRow = pitchers.length
        ? pitchers.reduce((b, p) => p.pSo > b.pSo ? p : b)
        : null;

      const makeStatLeader = (row: typeof hrLeaderRow, statLabel: string, value: string) => {
        if (!row) return null;
        const t = teamMap.get(row.teamId);
        return { playerId: row.playerId, name: row.playerName, teamAbbr: t?.abbreviation ?? "???",
          teamColor: t?.primaryColor ?? "#888", statLabel, value };
      };

      const statLeaders = {
        hrLeader: makeStatLeader(hrLeaderRow, "HR", hrLeaderRow?.hr.toString() ?? "0"),
        avgLeader: makeStatLeader(avgLeaderRow, "AVG",
          avgLeaderRow ? (avgLeaderRow.ab > 0 ? (avgLeaderRow.h / avgLeaderRow.ab).toFixed(3) : ".000") : ""),
        eraLeader: makeStatLeader(eraLeaderRow, "ERA",
          eraLeaderRow ? (eraLeaderRow.ipOuts > 0 ? ((eraLeaderRow.pEr * 27) / eraLeaderRow.ipOuts).toFixed(2) : "0.00") : ""),
        soLeader: makeStatLeader(soLeaderRow, "SO", soLeaderRow?.pSo.toString() ?? "0"),
      };

      // ── Team standings for this season ──────────────────────────────────────
      const teamStandings = sortedStandings.map(s => {
        const t = teamMap.get(s.teamId);
        const confName = confMap.get(t?.conferenceId ?? "")?.name ?? "";
        return {
          teamId: s.teamId, name: t?.name ?? "", abbr: t?.abbreviation ?? "???",
          color: t?.primaryColor ?? "#888", confName,
          wins: s.wins, losses: s.losses,
          confWins: s.conferenceWins, confLosses: s.conferenceLosses,
          isCwsChamp: s.teamId === cwsChampId,
          isConfChamp: confChamps.some(c => c.teamId === s.teamId),
        };
      });

      // ── Recruiting snapshots for this season ─────────────────────────────────
      const recruitingSnapshots = allRecruitSnaps
        .filter(s => s.season === selectedSeason)
        .sort((a, b) => a.classRank - b.classRank)
        .map(s => {
          const t = teamMap.get(s.teamId);
          const grade = archiveGradeFromScore(s.classScore);
          return {
            teamId: s.teamId, name: t?.name ?? "", abbr: t?.abbreviation ?? "???",
            color: t?.primaryColor ?? "#888", classRank: s.classRank,
            classScore: s.classScore, grade,
            totalCommits: s.totalCommits, fiveStars: s.fiveStars, fourStars: s.fourStars,
            threeStars: s.threeStars, twoStars: s.twoStars, oneStars: s.oneStars,
            topRecruitName: s.topRecruitName, topRecruitOvr: s.topRecruitOvr,
            topRecruitStars: s.topRecruitStars,
          };
        });

      // ── Departed stars for this season ──────────────────────────────────────
      const departedStars = allPlayerHistory
        .filter(h => h.departedSeason === selectedSeason)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 50)
        .map(h => {
          const t = teamMap.get(h.teamId);
          return {
            id: h.id, firstName: h.firstName, lastName: h.lastName,
            position: h.position, overall: h.overall, starRating: h.starRating,
            departureType: h.departureType, draftRound: h.draftRound,
            seasonsPlayed: h.seasonsPlayed, finalEligibility: h.finalEligibility,
            teamId: h.teamId, teamName: t?.name ?? "Unknown",
            teamAbbr: t?.abbreviation ?? "???", teamColor: t?.primaryColor ?? "#888",
            abilities: Array.isArray(h.abilities) ? h.abilities : [],
          };
        });

      // ── Legendary games (top drama recaps) ──────────────────────────────────
      const seasonRecaps = allRecaps.filter(r => r.season === selectedSeason);
      const scoredRecaps = seasonRecaps.map(r => {
        const phaseScore = r.phase === "cws" ? 10
          : r.phase === "super_regionals" ? 6
          : r.phase === "conference_championship" ? 4 : 0;
        const diff = Math.abs((r.homeScore ?? 0) - (r.awayScore ?? 0));
        const closenessScore = diff <= 1 ? 4 : diff <= 2 ? 2 : 0;
        const badgeScore = Array.isArray(r.badges) ? r.badges.length : 0;
        return { recap: r, dramaScore: phaseScore + closenessScore + badgeScore };
      });
      scoredRecaps.sort((a, b) => b.dramaScore - a.dramaScore);
      const legendaryGames = scoredRecaps.slice(0, 10).map(x => ({
        gameId: x.recap.gameId, headline: x.recap.headline,
        homeTeamName: x.recap.homeTeamName, awayTeamName: x.recap.awayTeamName,
        homeTeamAbbr: x.recap.homeTeamAbbr, awayTeamAbbr: x.recap.awayTeamAbbr,
        homeScore: x.recap.homeScore, awayScore: x.recap.awayScore,
        phase: x.recap.phase, week: x.recap.week,
        playerOfGame: x.recap.playerOfGame,
        turningPoint: x.recap.turningPoint,
        badges: x.recap.badges,
        dramaScore: x.dramaScore,
      }));

      // ── Coach of the year (top recruiting score this season) ────────────────
      const seasonCoachHistory = allCoachHistory.filter(c => c.season === selectedSeason);
      const recruiterOfYear = seasonCoachHistory.length
        ? seasonCoachHistory.reduce((best, c) =>
            (c.recruitingScore ?? 0) > (best.recruitingScore ?? 0) ? c : best)
        : null;
      const royCoach = recruiterOfYear ? coachMap.get(recruiterOfYear.coachId) : null;
      const royCoachName = royCoach
        ? `${royCoach.firstName} ${royCoach.lastName}`
        : recruiterOfYear?.teamName ?? null;

      res.json({
        availableSeasons,
        selectedSeason,
        overview: {
          cwsChampion: makeTeamSummary(champId),
          cwsRunnerUp: makeTeamSummary(ruId),
          confChampions: confChamps,
          statLeaders,
          recruiterOfYear: recruiterOfYear ? {
            coachName: royCoachName,
            teamName: recruiterOfYear.teamName,
            teamAbbr: recruiterOfYear.teamAbbr,
            grade: archiveGradeFromScore(recruiterOfYear.recruitingScore ?? null),
            score: recruiterOfYear.recruitingScore,
          } : null,
        },
        recruitingSnapshots,
        departedStars,
        legendaryGames,
        teamStandings,
      });
    } catch (error) {
      console.error("Failed to load archive:", error);
      res.status(500).json({ message: "Failed to load archive" });
    }
  });

  // GET /api/leagues/:id/archive/team/:teamId
  app.get("/api/leagues/:id/archive/team/:teamId", requireAuth, async (req, res) => {
    try {
      const leagueId = req.params.id as string;
      const teamId = req.params.teamId as string;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      const team = await storage.getTeam(teamId);
      if (!team || team.leagueId !== leagueId)
        return res.status(404).json({ message: "Team not found" });

      const [allStandings, allGames, teamCoaches, playerHistory, coachHistory, recruitSnaps] =
        await Promise.all([
          storage.getStandingsByTeam(teamId),
          storage.getGamesByLeague(leagueId),
          storage.getCoachesByLeague(leagueId),
          storage.getPlayerHistoryByLeague(leagueId).then(h => h.filter(x => x.teamId === teamId)),
          storage.getCoachSeasonHistoryByLeague(leagueId),
          storage.getRecruitingClassSnapshotsAllSeasons(leagueId),
        ]);
      const teamCoachMap = new Map(teamCoaches.map(c => [c.id, c]));

      const seasons = Array.from(new Set(allStandings.map(s => s.season))).sort((a, b) => b - a);

      const teamHistory = seasons.map(season => {
        const standing = allStandings.find(s => s.season === season);
        const snap = recruitSnaps.find(s => s.season === season && s.teamId === teamId);
        const teamCoach = coachHistory.find(c => c.season === season && c.teamId === teamId);
        const departed = playerHistory.filter(h => h.departedSeason === season);
        const drafted = departed.filter(h => h.departureType === "drafted" || h.departureType === "declared");

        // Postseason result from games
        const cwsGames = allGames.filter(g =>
          g.phase === "cws" && g.season === season && g.isComplete &&
          (g.homeTeamId === teamId || g.awayTeamId === teamId));
        const srGames = allGames.filter(g =>
          g.phase === "super_regionals" && g.season === season && g.isComplete &&
          (g.homeTeamId === teamId || g.awayTeamId === teamId));
        const ccGames = allGames.filter(g =>
          g.phase === "conference_championship" && g.season === season && g.isComplete &&
          (g.homeTeamId === teamId || g.awayTeamId === teamId));

        let postseasonResult: string | null = null;
        if (cwsGames.length > 0) {
          const cwsWinsMap: Record<string, number> = {};
          const leagueAllCwsGames = allGames.filter(g => g.phase === "cws" && g.season === season && g.isComplete);
          for (const g of leagueAllCwsGames) {
            const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            cwsWinsMap[wId] = (cwsWinsMap[wId] || 0) + 1;
          }
          const champId = Object.entries(cwsWinsMap).find(([, w]) => w >= 2)?.[0] ?? null;
          if (champId === teamId) postseasonResult = "CWS Champion";
          else postseasonResult = "CWS Appearance";
        } else if (srGames.length > 0) {
          const srWon = srGames.some(g => {
            const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            return wId === teamId;
          });
          postseasonResult = srWon ? "Super Regionals Win" : "Super Regionals";
        } else if (ccGames.length > 0) {
          const ccWon = ccGames.some(g => {
            const wId = (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId : g.awayTeamId;
            return wId === teamId;
          });
          postseasonResult = ccWon ? "Conf Champion" : "Conf Championship";
        }

        const topDepart = drafted.length
          ? drafted.sort((a, b) => (a.draftRound ?? 99) - (b.draftRound ?? 99))[0]
          : null;

        return {
          season,
          wins: standing?.wins ?? 0,
          losses: standing?.losses ?? 0,
          confWins: standing?.conferenceWins ?? 0,
          confLosses: standing?.conferenceLosses ?? 0,
          postseasonResult,
          classRank: snap?.classRank ?? null,
          classScore: snap?.classScore ?? null,
          grade: archiveGradeFromScore(snap?.classScore ?? null),
          topRecruitName: snap?.topRecruitName ?? null,
          topRecruitOvr: snap?.topRecruitOvr ?? null,
          topRecruitStars: snap?.topRecruitStars ?? null,
          totalCommits: snap?.totalCommits ?? 0,
          coachName: teamCoach?.coachId ?? null,
          departedCount: departed.length,
          draftedCount: drafted.length,
          topDraftPick: topDepart ? {
            name: `${topDepart.firstName} ${topDepart.lastName}`,
            position: topDepart.position,
            round: topDepart.draftRound,
            overall: topDepart.overall,
          } : null,
          departed: departed
            .sort((a, b) => b.overall - a.overall)
            .slice(0, 8)
            .map(h => ({
              name: `${h.firstName} ${h.lastName}`,
              position: h.position,
              overall: h.overall,
              starRating: h.starRating,
              departureType: h.departureType,
              draftRound: h.draftRound,
            })),
        };
      });

      res.json({ team: { id: team.id, name: team.name, abbr: team.abbreviation,
        color: team.primaryColor, mascot: team.mascot }, teamHistory });
    } catch (error) {
      console.error("Failed to load team archive:", error);
      res.status(500).json({ message: "Failed to load team archive" });
    }
  });

  // ============ SIGNING DAY SUMMARY API ============
  app.get("/api/leagues/:id/signing-day", requireAuth, async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id as string);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const teams = await storage.getTeamsByLeague(league.id);
      const recruits = await storage.getRecruitsByLeague(league.id);
      const signedRecruits = recruits.filter(r => r.signedTeamId);
      const unsignedRecruits = recruits.filter(r => !r.signedTeamId);
      
      // Get transfer portal activity from player history
      const history = await storage.getPlayerHistoryByLeague(league.id);
      const portalDepartures = history.filter(h => 
        h.departureType === "transfer_portal" && h.departedSeason === league.currentSeason
      );
      
      // Get current transfer portal players (still unsigned)
      const portalPlayers = await storage.getTransferPortalPlayersByLeague(league.id);
      
      // Group signed recruits by team
      const teamSignings = teams.map(team => {
        const teamRecruits = signedRecruits
          .filter(r => r.signedTeamId === team.id)
          .map(r => ({
            id: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
            position: r.position,
            starRating: r.starRating,
            overall: r.overall,
            homeState: r.homeState,
            isBlueChip: r.isBlueChip,
          }));
        
        return {
          teamId: team.id,
          teamName: team.name,
          abbreviation: team.abbreviation,
          primaryColor: team.primaryColor,
          secondaryColor: team.secondaryColor,
          mascot: team.mascot,
          recruits: teamRecruits,
          totalRecruits: teamRecruits.length,
          avgRating: teamRecruits.length > 0 
            ? Math.round(teamRecruits.reduce((sum, r) => sum + (r.starRating || 3), 0) / teamRecruits.length * 10) / 10
            : 0,
          totalStars: teamRecruits.reduce((sum, r) => sum + (r.starRating || 3), 0),
        };
      })
      .filter(t => t.totalRecruits > 0)
      .sort((a, b) => b.totalStars - a.totalStars);
      
      res.json({
        teamSignings,
        totalSigned: signedRecruits.length,
        totalUnsigned: unsignedRecruits.length,
        totalRecruits: recruits.length,
        transferPortal: {
          departed: portalDepartures.length,
          stillAvailable: portalPlayers.length,
        },
      });
    } catch (error) {
      console.error("Failed to get signing day data:", error);
      res.status(500).json({ message: "Failed to get signing day data" });
    }
  });
}
