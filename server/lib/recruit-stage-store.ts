import type { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { leagues, teams, recruits, recruitingInterests, players, storylineRecruits, leagueEvents } from "../../shared/schema";
import type { RecruitStageStore } from "./recruit-stage-progression";

/** Every read/write uses the owner's client; no global pool or storage writes. */
export async function createRecruitStageStore(client: PoolClient, leagueId: string): Promise<RecruitStageStore> {
  const db = drizzle(client);
  // Recruit then team matches manual signing's lock order. External writers
  // that do not share the advance protocol still need separate coordination.
  await client.query("SELECT id FROM recruits WHERE league_id=$1 ORDER BY id FOR UPDATE", [leagueId]);
  await client.query("SELECT id FROM teams WHERE league_id=$1 ORDER BY id FOR UPDATE", [leagueId]);
  await client.query("SELECT i.id FROM recruiting_interests i JOIN teams t ON t.id=i.team_id JOIN recruits r ON r.id=i.recruit_id WHERE t.league_id=$1 AND r.league_id=$1 ORDER BY i.id FOR UPDATE OF i", [leagueId]);
  await client.query("SELECT p.id FROM players p JOIN teams t ON t.id=p.team_id WHERE t.league_id=$1 ORDER BY p.id FOR UPDATE OF p", [leagueId]);
  await client.query("SELECT id FROM storyline_recruits WHERE league_id=$1 ORDER BY id FOR UPDATE", [leagueId]);
  const scoped = (id: string) => { if (id !== leagueId) throw new Error("Recruit stage league mismatch"); };
  const one = <T>(rows: T[]): T => { if (rows.length !== 1) throw new Error("Recruit stage write did not affect exactly one scoped row"); return rows[0]; };
  const teamIds = db.select({id:teams.id}).from(teams).where(eq(teams.leagueId,leagueId));
  const recruitIds = db.select({id:recruits.id}).from(recruits).where(eq(recruits.leagueId,leagueId));
  return {
    getLeague: async id => { scoped(id); return (await db.select().from(leagues).where(eq(leagues.id,id)))[0]; },
    getRecruitsByLeague: async id => { scoped(id); return db.select().from(recruits).where(eq(recruits.leagueId,id)); },
    getTeamsByLeague: async id => { scoped(id); return db.select().from(teams).where(eq(teams.leagueId,id)); },
    getPlayersByLeague: async id => { scoped(id); return db.select().from(players).where(inArray(players.teamId,teamIds)); },
    getRecruitingInterestsByLeague: async id => { scoped(id); return db.select().from(recruitingInterests).where(and(inArray(recruitingInterests.teamId,teamIds),inArray(recruitingInterests.recruitId,recruitIds))); },
    getStorylineRecruitsByLeague: async (id,season) => { scoped(id); return db.select().from(storylineRecruits).where(and(eq(storylineRecruits.leagueId,id),season === undefined ? undefined : eq(storylineRecruits.season,season))); },
    updateRecruitingInterest: async (id,data) => one(await db.update(recruitingInterests).set({interestLevel:data.interestLevel}).where(and(eq(recruitingInterests.id,id),inArray(recruitingInterests.teamId,teamIds),inArray(recruitingInterests.recruitId,recruitIds))).returning()),
    updateRecruit: async (id,data) => {
      if (data.signedTeamId && !(await db.select({id:teams.id}).from(teams).where(and(eq(teams.id,data.signedTeamId),eq(teams.leagueId,leagueId)))).length) throw new Error("Recruit signing team outside league");
      return one(await db.update(recruits).set({stage:data.stage,signedTeamId:data.signedTeamId}).where(and(eq(recruits.id,id),eq(recruits.leagueId,leagueId))).returning());
    },
    updateTeam: async (id,data) => one(await db.update(teams).set({nilRecruitingSpent:data.nilRecruitingSpent,nilSpent:data.nilSpent}).where(and(eq(teams.id,id),eq(teams.leagueId,leagueId))).returning()),
    createLeagueEvent: async data => {
      scoped(data.leagueId);
      if (data.teamId && !(await db.select({id:teams.id}).from(teams).where(and(eq(teams.id,data.teamId),eq(teams.leagueId,leagueId)))).length) throw new Error("Recruit event team outside league");
      return one(await db.insert(leagueEvents).values(data).returning());
    },
  };
}
