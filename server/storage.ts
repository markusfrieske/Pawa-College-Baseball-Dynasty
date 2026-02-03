import {
  users, leagues, conferences, teams, coaches, scouts,
  players, recruits, recruitingInterests, games, standings, auditLogs, leagueInvites, dynastyNews,
  recruitingActionsLog, recruitTopSchools,
  type User, type InsertUser,
  type League, type InsertLeague,
  type Conference, type InsertConference,
  type Team, type InsertTeam,
  type Coach, type InsertCoach,
  type Scout, type InsertScout,
  type Player, type InsertPlayer,
  type Recruit, type InsertRecruit,
  type RecruitingInterest, type InsertRecruitingInterest,
  type Game, type InsertGame,
  type Standings, type InsertStandings,
  type AuditLog, type InsertAuditLog,
  type LeagueInvite, type InsertLeagueInvite,
  type DynastyNews, type InsertDynastyNews,
  type RecruitingActionsLog, type InsertRecruitingActionsLog,
  type RecruitTopSchools, type InsertRecruitTopSchools,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getLeaguesByUser(userId: string): Promise<League[]>;
  getLeague(id: string): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: string, data: Partial<League>): Promise<League | undefined>;

  getConferencesByLeague(leagueId: string): Promise<Conference[]>;
  createConference(conference: InsertConference): Promise<Conference>;

  getTeamsByLeague(leagueId: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, data: Partial<Team>): Promise<Team | undefined>;

  getCoach(id: string): Promise<Coach | undefined>;
  getCoachByTeam(teamId: string): Promise<Coach | undefined>;
  getCoachesByLeague(leagueId: string): Promise<Coach[]>;
  createCoach(coach: InsertCoach): Promise<Coach>;
  updateCoach(id: string, data: Partial<Coach>): Promise<Coach | undefined>;

  getScoutsByLeague(leagueId: string): Promise<Scout[]>;
  createScout(scout: InsertScout): Promise<Scout>;

  getPlayersByTeam(teamId: string): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;

  getRecruitsByLeague(leagueId: string): Promise<Recruit[]>;
  getRecruit(id: string): Promise<Recruit | undefined>;
  createRecruit(recruit: InsertRecruit): Promise<Recruit>;
  updateRecruit(id: string, data: Partial<Recruit>): Promise<Recruit | undefined>;
  deleteRecruitsByLeague(leagueId: string): Promise<void>;

  getRecruitingInterestsByTeam(teamId: string): Promise<RecruitingInterest[]>;
  getRecruitingInterestsByLeague(leagueId: string): Promise<RecruitingInterest[]>;
  getRecruitingInterest(recruitId: string, teamId: string): Promise<RecruitingInterest | undefined>;
  createRecruitingInterest(interest: InsertRecruitingInterest): Promise<RecruitingInterest>;
  updateRecruitingInterest(id: string, data: Partial<RecruitingInterest>): Promise<RecruitingInterest | undefined>;

  getGamesByLeague(leagueId: string): Promise<Game[]>;
  getGamesByTeam(teamId: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, data: Partial<Game>): Promise<Game | undefined>;

  getStandingsByLeague(leagueId: string, season: number): Promise<Standings[]>;
  createStandings(standings: InsertStandings): Promise<Standings>;
  updateStandings(id: string, data: Partial<Standings>): Promise<Standings | undefined>;

  getAuditLogsByLeague(leagueId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  getLeagueInvitesByLeague(leagueId: string): Promise<LeagueInvite[]>;
  getLeagueInviteByCode(inviteCode: string): Promise<LeagueInvite | undefined>;
  getLeagueInviteByEmail(leagueId: string, email: string): Promise<LeagueInvite | undefined>;
  createLeagueInvite(invite: InsertLeagueInvite): Promise<LeagueInvite>;
  updateLeagueInvite(id: string, data: Partial<LeagueInvite>): Promise<LeagueInvite | undefined>;

  getDynastyNewsByLeague(leagueId: string): Promise<DynastyNews[]>;
  createDynastyNews(news: InsertDynastyNews): Promise<DynastyNews>;
  deleteDynastyNews(id: string): Promise<void>;

  getRecruitingActionsLog(recruitId: string, teamId: string): Promise<RecruitingActionsLog[]>;
  createRecruitingAction(action: InsertRecruitingActionsLog): Promise<RecruitingActionsLog>;

  getRecruitTopSchools(recruitId: string): Promise<RecruitTopSchools[]>;
  getRecruitTopSchool(recruitId: string, teamId: string): Promise<RecruitTopSchools | undefined>;
  createRecruitTopSchool(topSchool: InsertRecruitTopSchools): Promise<RecruitTopSchools>;
  updateRecruitTopSchool(id: string, data: Partial<RecruitTopSchools>): Promise<RecruitTopSchools | undefined>;
  
  updatePlayer(id: string, data: Partial<Player>): Promise<Player | undefined>;
  getPlayer(id: string): Promise<Player | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getLeaguesByUser(userId: string): Promise<League[]> {
    return await db.select().from(leagues).where(eq(leagues.commissionerId, userId));
  }

  async getLeague(id: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league || undefined;
  }

  async createLeague(insertLeague: InsertLeague): Promise<League> {
    const [league] = await db.insert(leagues).values(insertLeague).returning();
    return league;
  }

  async updateLeague(id: string, data: Partial<League>): Promise<League | undefined> {
    const [league] = await db.update(leagues).set(data).where(eq(leagues.id, id)).returning();
    return league || undefined;
  }

  async getConferencesByLeague(leagueId: string): Promise<Conference[]> {
    return await db.select().from(conferences).where(eq(conferences.leagueId, leagueId));
  }

  async createConference(insertConference: InsertConference): Promise<Conference> {
    const [conference] = await db.insert(conferences).values(insertConference).returning();
    return conference;
  }

  async getTeamsByLeague(leagueId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.leagueId, leagueId));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db.insert(teams).values(insertTeam).returning();
    return team;
  }

  async updateTeam(id: string, data: Partial<Team>): Promise<Team | undefined> {
    const [team] = await db.update(teams).set(data).where(eq(teams.id, id)).returning();
    return team || undefined;
  }

  async getCoach(id: string): Promise<Coach | undefined> {
    const [coach] = await db.select().from(coaches).where(eq(coaches.id, id));
    return coach || undefined;
  }

  async getCoachByTeam(teamId: string): Promise<Coach | undefined> {
    const [coach] = await db.select().from(coaches).where(eq(coaches.teamId, teamId));
    return coach || undefined;
  }

  async getCoachesByLeague(leagueId: string): Promise<Coach[]> {
    return await db.select().from(coaches).where(eq(coaches.leagueId, leagueId));
  }

  async createCoach(insertCoach: InsertCoach): Promise<Coach> {
    const [coach] = await db.insert(coaches).values(insertCoach).returning();
    return coach;
  }

  async updateCoach(id: string, data: Partial<Coach>): Promise<Coach | undefined> {
    const [coach] = await db.update(coaches).set(data).where(eq(coaches.id, id)).returning();
    return coach;
  }

  async getScoutsByLeague(leagueId: string): Promise<Scout[]> {
    return await db.select().from(scouts).where(eq(scouts.leagueId, leagueId));
  }

  async createScout(insertScout: InsertScout): Promise<Scout> {
    const [scout] = await db.insert(scouts).values(insertScout).returning();
    return scout;
  }

  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.teamId, teamId));
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db.insert(players).values(insertPlayer).returning();
    return player;
  }

  async getRecruitsByLeague(leagueId: string): Promise<Recruit[]> {
    return await db.select().from(recruits).where(eq(recruits.leagueId, leagueId));
  }

  async getRecruit(id: string): Promise<Recruit | undefined> {
    const [recruit] = await db.select().from(recruits).where(eq(recruits.id, id));
    return recruit || undefined;
  }

  async createRecruit(insertRecruit: InsertRecruit): Promise<Recruit> {
    const [recruit] = await db.insert(recruits).values(insertRecruit).returning();
    return recruit;
  }

  async updateRecruit(id: string, data: Partial<Recruit>): Promise<Recruit | undefined> {
    const [recruit] = await db.update(recruits).set(data).where(eq(recruits.id, id)).returning();
    return recruit || undefined;
  }

  async deleteRecruitsByLeague(leagueId: string): Promise<void> {
    // First delete all recruiting interests for recruits in this league
    const leagueRecruits = await db.select().from(recruits).where(eq(recruits.leagueId, leagueId));
    for (const recruit of leagueRecruits) {
      await db.delete(recruitingInterests).where(eq(recruitingInterests.recruitId, recruit.id));
    }
    // Then delete the recruits
    await db.delete(recruits).where(eq(recruits.leagueId, leagueId));
  }

  async getRecruitingInterestsByTeam(teamId: string): Promise<RecruitingInterest[]> {
    return await db.select().from(recruitingInterests).where(eq(recruitingInterests.teamId, teamId));
  }

  async getRecruitingInterestsByLeague(leagueId: string): Promise<RecruitingInterest[]> {
    const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, leagueId));
    const teamIds = leagueTeams.map(t => t.id);
    if (teamIds.length === 0) return [];
    return await db.select().from(recruitingInterests).where(inArray(recruitingInterests.teamId, teamIds));
  }

  async getRecruitingInterest(recruitId: string, teamId: string): Promise<RecruitingInterest | undefined> {
    const [interest] = await db.select().from(recruitingInterests)
      .where(and(eq(recruitingInterests.recruitId, recruitId), eq(recruitingInterests.teamId, teamId)));
    return interest || undefined;
  }

  async createRecruitingInterest(insertInterest: InsertRecruitingInterest): Promise<RecruitingInterest> {
    const [interest] = await db.insert(recruitingInterests).values(insertInterest).returning();
    return interest;
  }

  async updateRecruitingInterest(id: string, data: Partial<RecruitingInterest>): Promise<RecruitingInterest | undefined> {
    const [interest] = await db.update(recruitingInterests).set(data).where(eq(recruitingInterests.id, id)).returning();
    return interest || undefined;
  }

  async getGamesByLeague(leagueId: string): Promise<Game[]> {
    return await db.select().from(games).where(eq(games.leagueId, leagueId));
  }

  async getGamesByTeam(teamId: string): Promise<Game[]> {
    return await db.select().from(games).where(
      or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
    ).orderBy(games.week);
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const [game] = await db.insert(games).values(insertGame).returning();
    return game;
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | undefined> {
    const [game] = await db.update(games).set(data).where(eq(games.id, id)).returning();
    return game || undefined;
  }

  async getStandingsByLeague(leagueId: string, season: number): Promise<Standings[]> {
    return await db.select().from(standings)
      .where(and(eq(standings.leagueId, leagueId), eq(standings.season, season)));
  }

  async createStandings(insertStandings: InsertStandings): Promise<Standings> {
    const [standing] = await db.insert(standings).values(insertStandings).returning();
    return standing;
  }

  async updateStandings(id: string, data: Partial<Standings>): Promise<Standings | undefined> {
    const [standing] = await db.update(standings).set(data).where(eq(standings.id, id)).returning();
    return standing || undefined;
  }

  async getAuditLogsByLeague(leagueId: string): Promise<AuditLog[]> {
    return await db.select().from(auditLogs)
      .where(eq(auditLogs.leagueId, leagueId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(100);
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getLeagueInvitesByLeague(leagueId: string): Promise<LeagueInvite[]> {
    return await db.select().from(leagueInvites)
      .where(eq(leagueInvites.leagueId, leagueId))
      .orderBy(desc(leagueInvites.createdAt));
  }

  async getLeagueInviteByCode(inviteCode: string): Promise<LeagueInvite | undefined> {
    const [invite] = await db.select().from(leagueInvites)
      .where(eq(leagueInvites.inviteCode, inviteCode));
    return invite || undefined;
  }

  async getLeagueInviteByEmail(leagueId: string, email: string): Promise<LeagueInvite | undefined> {
    const [invite] = await db.select().from(leagueInvites)
      .where(and(eq(leagueInvites.leagueId, leagueId), eq(leagueInvites.email, email)));
    return invite || undefined;
  }

  async createLeagueInvite(insertInvite: InsertLeagueInvite): Promise<LeagueInvite> {
    const [invite] = await db.insert(leagueInvites).values(insertInvite).returning();
    return invite;
  }

  async updateLeagueInvite(id: string, data: Partial<LeagueInvite>): Promise<LeagueInvite | undefined> {
    const [invite] = await db.update(leagueInvites).set(data).where(eq(leagueInvites.id, id)).returning();
    return invite || undefined;
  }

  async getDynastyNewsByLeague(leagueId: string): Promise<DynastyNews[]> {
    return await db.select().from(dynastyNews)
      .where(eq(dynastyNews.leagueId, leagueId))
      .orderBy(desc(dynastyNews.isSticky), desc(dynastyNews.createdAt));
  }

  async createDynastyNews(insertNews: InsertDynastyNews): Promise<DynastyNews> {
    const [news] = await db.insert(dynastyNews).values(insertNews).returning();
    return news;
  }

  async deleteDynastyNews(id: string): Promise<void> {
    await db.delete(dynastyNews).where(eq(dynastyNews.id, id));
  }

  async getRecruitingActionsLog(recruitId: string, teamId: string): Promise<RecruitingActionsLog[]> {
    return await db.select().from(recruitingActionsLog)
      .where(and(eq(recruitingActionsLog.recruitId, recruitId), eq(recruitingActionsLog.teamId, teamId)))
      .orderBy(desc(recruitingActionsLog.createdAt));
  }

  async createRecruitingAction(action: InsertRecruitingActionsLog): Promise<RecruitingActionsLog> {
    const [log] = await db.insert(recruitingActionsLog).values(action).returning();
    return log;
  }

  async getRecruitTopSchools(recruitId: string): Promise<RecruitTopSchools[]> {
    return await db.select().from(recruitTopSchools)
      .where(eq(recruitTopSchools.recruitId, recruitId));
  }

  async getRecruitTopSchool(recruitId: string, teamId: string): Promise<RecruitTopSchools | undefined> {
    const [topSchool] = await db.select().from(recruitTopSchools)
      .where(and(eq(recruitTopSchools.recruitId, recruitId), eq(recruitTopSchools.teamId, teamId)));
    return topSchool || undefined;
  }

  async createRecruitTopSchool(topSchool: InsertRecruitTopSchools): Promise<RecruitTopSchools> {
    const [created] = await db.insert(recruitTopSchools).values(topSchool).returning();
    return created;
  }

  async updateRecruitTopSchool(id: string, data: Partial<RecruitTopSchools>): Promise<RecruitTopSchools | undefined> {
    const [updated] = await db.update(recruitTopSchools).set(data).where(eq(recruitTopSchools.id, id)).returning();
    return updated || undefined;
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async updatePlayer(id: string, data: Partial<Player>): Promise<Player | undefined> {
    const [player] = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return player || undefined;
  }
}

export const storage = new DatabaseStorage();
