import {
  users, leagues, conferences, teams, coaches, scouts,
  players, recruits, recruitingInterests, games, standings, auditLogs, leagueInvites, dynastyNews,
  recruitingActionsLog, recruitTopSchools, transferPortalInterests, playerHistory, playerPromises,
  storyEvents, storyArcs, storyArcChapters, moments, playerSeasonStats,
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
  type TransferPortalInterest, type InsertTransferPortalInterest,
  type PlayerHistory, type InsertPlayerHistory,
  type PlayerPromise, type InsertPlayerPromise,
  type StoryEvent, type InsertStoryEvent,
  type StoryArc, type InsertStoryArc,
  type StoryArcChapter, type InsertStoryArcChapter,
  type Moment, type InsertMoment,
  type PlayerSeasonStats, type InsertPlayerSeasonStats,
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
  getRecruitingInterestsByRecruit(recruitId: string): Promise<RecruitingInterest[]>;
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
  getRecruitingActionsLogByTeam(teamId: string, leagueId: string): Promise<RecruitingActionsLog[]>;
  createRecruitingAction(action: InsertRecruitingActionsLog): Promise<RecruitingActionsLog>;

  getRecruitTopSchools(recruitId: string): Promise<RecruitTopSchools[]>;
  getRecruitTopSchool(recruitId: string, teamId: string): Promise<RecruitTopSchools | undefined>;
  createRecruitTopSchool(topSchool: InsertRecruitTopSchools): Promise<RecruitTopSchools>;
  updateRecruitTopSchool(id: string, data: Partial<RecruitTopSchools>): Promise<RecruitTopSchools | undefined>;
  
  updatePlayer(id: string, data: Partial<Player>): Promise<Player | undefined>;
  getPlayer(id: string): Promise<Player | undefined>;
  
  getTransferPortalPlayersByLeague(leagueId: string): Promise<Player[]>;
  getTransferPortalInterestsByTeam(teamId: string): Promise<TransferPortalInterest[]>;
  getTransferPortalInterest(playerId: string, teamId: string): Promise<TransferPortalInterest | undefined>;
  createTransferPortalInterest(interest: InsertTransferPortalInterest): Promise<TransferPortalInterest>;
  updateTransferPortalInterest(id: string, data: Partial<TransferPortalInterest>): Promise<TransferPortalInterest | undefined>;
  deleteTransferPortalInterestsByPlayer(playerId: string): Promise<void>;

  deletePlayer(id: string): Promise<void>;
  createPlayerHistory(data: InsertPlayerHistory): Promise<PlayerHistory>;
  getPlayerHistoryByLeague(leagueId: string): Promise<PlayerHistory[]>;
  getPlayerHistoryByTeam(teamId: string): Promise<PlayerHistory[]>;
  deleteLeague(id: string): Promise<void>;

  createPlayerPromise(data: InsertPlayerPromise): Promise<PlayerPromise>;
  getPlayerPromisesByTeam(teamId: string): Promise<PlayerPromise[]>;
  getPlayerPromisesByPlayer(playerId: string): Promise<PlayerPromise[]>;
  getActivePromisesByLeague(leagueId: string): Promise<PlayerPromise[]>;
  updatePlayerPromise(id: string, data: Partial<PlayerPromise>): Promise<PlayerPromise | undefined>;
  getPendingDeparturesByLeague(leagueId: string): Promise<Player[]>;

  getStoryEventsByLeague(leagueId: string): Promise<StoryEvent[]>;
  getStoryEventsByTeam(teamId: string): Promise<StoryEvent[]>;
  getPendingStoryEvents(leagueId: string, teamId?: string): Promise<StoryEvent[]>;
  createStoryEvent(event: InsertStoryEvent): Promise<StoryEvent>;
  updateStoryEvent(id: string, data: Partial<StoryEvent>): Promise<StoryEvent | undefined>;

  getStoryArcsByLeague(leagueId: string): Promise<StoryArc[]>;
  getActiveStoryArcs(leagueId: string): Promise<StoryArc[]>;
  createStoryArc(arc: InsertStoryArc): Promise<StoryArc>;
  updateStoryArc(id: string, data: Partial<StoryArc>): Promise<StoryArc | undefined>;

  getChaptersByArc(arcId: string): Promise<StoryArcChapter[]>;
  createStoryArcChapter(chapter: InsertStoryArcChapter): Promise<StoryArcChapter>;
  updateStoryArcChapter(id: string, data: Partial<StoryArcChapter>): Promise<StoryArcChapter | undefined>;

  getMomentsByLeague(leagueId: string): Promise<Moment[]>;
  getMomentsByTeam(teamId: string): Promise<Moment[]>;
  createMoment(moment: InsertMoment): Promise<Moment>;

  getPlayerSeasonStats(playerId: string, leagueId: string): Promise<PlayerSeasonStats[]>;
  getPlayerSeasonStatsBySeason(leagueId: string, season: number): Promise<PlayerSeasonStats[]>;
  upsertPlayerSeasonStats(data: InsertPlayerSeasonStats): Promise<PlayerSeasonStats>;
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
    const leagueRecruits = await db.select({ id: recruits.id }).from(recruits).where(eq(recruits.leagueId, leagueId));
    const recruitIds = leagueRecruits.map(r => r.id);
    if (recruitIds.length > 0) {
      await db.update(storyArcs).set({ targetRecruitId: null }).where(inArray(storyArcs.targetRecruitId, recruitIds));
      await db.update(storyEvents).set({ targetRecruitId: null }).where(inArray(storyEvents.targetRecruitId, recruitIds));
      await db.delete(recruitTopSchools).where(inArray(recruitTopSchools.recruitId, recruitIds));
      await db.delete(recruitingActionsLog).where(inArray(recruitingActionsLog.recruitId, recruitIds));
      await db.delete(recruitingInterests).where(inArray(recruitingInterests.recruitId, recruitIds));
    }
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

  async getRecruitingInterestsByRecruit(recruitId: string): Promise<RecruitingInterest[]> {
    return await db.select().from(recruitingInterests).where(eq(recruitingInterests.recruitId, recruitId));
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

  async getRecruitingActionsLogByTeam(teamId: string, leagueId: string): Promise<RecruitingActionsLog[]> {
    return await db.select().from(recruitingActionsLog)
      .where(and(eq(recruitingActionsLog.teamId, teamId), eq(recruitingActionsLog.leagueId, leagueId)))
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

  async getTransferPortalPlayersByLeague(leagueId: string): Promise<Player[]> {
    const leagueTeams = await this.getTeamsByLeague(leagueId);
    const teamIds = leagueTeams.map(t => t.id);
    if (teamIds.length === 0) return [];
    return await db.select().from(players)
      .where(and(
        inArray(players.teamId, teamIds),
        eq(players.inTransferPortal, true)
      ));
  }

  async getTransferPortalInterestsByTeam(teamId: string): Promise<TransferPortalInterest[]> {
    return await db.select().from(transferPortalInterests).where(eq(transferPortalInterests.teamId, teamId));
  }

  async getTransferPortalInterest(playerId: string, teamId: string): Promise<TransferPortalInterest | undefined> {
    const [interest] = await db.select().from(transferPortalInterests)
      .where(and(
        eq(transferPortalInterests.playerId, playerId),
        eq(transferPortalInterests.teamId, teamId)
      ));
    return interest || undefined;
  }

  async createTransferPortalInterest(interest: InsertTransferPortalInterest): Promise<TransferPortalInterest> {
    const [created] = await db.insert(transferPortalInterests).values(interest).returning();
    return created;
  }

  async updateTransferPortalInterest(id: string, data: Partial<TransferPortalInterest>): Promise<TransferPortalInterest | undefined> {
    const [updated] = await db.update(transferPortalInterests).set(data).where(eq(transferPortalInterests.id, id)).returning();
    return updated || undefined;
  }

  async deleteTransferPortalInterestsByPlayer(playerId: string): Promise<void> {
    await db.delete(transferPortalInterests).where(eq(transferPortalInterests.playerId, playerId));
  }

  async deletePlayer(id: string): Promise<void> {
    await db.delete(transferPortalInterests).where(eq(transferPortalInterests.playerId, id));
    await db.delete(playerPromises).where(eq(playerPromises.playerId, id));
    await db.update(storyArcs).set({ targetPlayerId: null }).where(eq(storyArcs.targetPlayerId, id));
    await db.update(storyEvents).set({ targetPlayerId: null }).where(eq(storyEvents.targetPlayerId, id));
    await db.update(moments).set({ targetPlayerId: null }).where(eq(moments.targetPlayerId, id));
    await db.delete(players).where(eq(players.id, id));
  }

  async createPlayerHistory(data: InsertPlayerHistory): Promise<PlayerHistory> {
    const [history] = await db.insert(playerHistory).values(data).returning();
    return history;
  }

  async getPlayerHistoryByLeague(leagueId: string): Promise<PlayerHistory[]> {
    return db.select().from(playerHistory).where(eq(playerHistory.leagueId, leagueId));
  }

  async getPlayerHistoryByTeam(teamId: string): Promise<PlayerHistory[]> {
    return db.select().from(playerHistory).where(eq(playerHistory.teamId, teamId));
  }

  async deleteLeague(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const leagueTeams = await tx.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id));
      const teamIds = leagueTeams.map(t => t.id);

      const leagueArcs = await tx.select({ id: storyArcs.id }).from(storyArcs).where(eq(storyArcs.leagueId, id));
      const arcIds = leagueArcs.map(a => a.id);
      if (arcIds.length > 0) {
        await tx.delete(storyArcChapters).where(inArray(storyArcChapters.arcId, arcIds));
      }
      await tx.delete(storyArcs).where(eq(storyArcs.leagueId, id));
      await tx.delete(storyEvents).where(eq(storyEvents.leagueId, id));
      await tx.delete(moments).where(eq(moments.leagueId, id));

      await tx.delete(playerSeasonStats).where(eq(playerSeasonStats.leagueId, id));

      if (teamIds.length > 0) {
        await tx.delete(transferPortalInterests).where(inArray(transferPortalInterests.teamId, teamIds));
        await tx.delete(playerHistory).where(inArray(playerHistory.teamId, teamIds));
        await tx.delete(players).where(inArray(players.teamId, teamIds));
        await tx.delete(recruitingInterests).where(inArray(recruitingInterests.teamId, teamIds));
        await tx.delete(recruitTopSchools).where(inArray(recruitTopSchools.teamId, teamIds));
        await tx.delete(coaches).where(inArray(coaches.teamId, teamIds));
        await tx.delete(standings).where(inArray(standings.teamId, teamIds));
      }

      const leagueRecruits = await tx.select({ id: recruits.id }).from(recruits).where(eq(recruits.leagueId, id));
      const recruitIds = leagueRecruits.map(r => r.id);
      if (recruitIds.length > 0) {
        await tx.delete(recruitTopSchools).where(inArray(recruitTopSchools.recruitId, recruitIds));
        await tx.delete(recruitingActionsLog).where(inArray(recruitingActionsLog.recruitId, recruitIds));
        await tx.delete(recruitingInterests).where(inArray(recruitingInterests.recruitId, recruitIds));
      }

      await tx.delete(recruits).where(eq(recruits.leagueId, id));
      await tx.delete(games).where(eq(games.leagueId, id));
      await tx.delete(standings).where(eq(standings.leagueId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.leagueId, id));
      await tx.delete(leagueInvites).where(eq(leagueInvites.leagueId, id));
      await tx.delete(dynastyNews).where(eq(dynastyNews.leagueId, id));
      await tx.delete(scouts).where(eq(scouts.leagueId, id));
      await tx.delete(teams).where(eq(teams.leagueId, id));
      await tx.delete(conferences).where(eq(conferences.leagueId, id));
      await tx.delete(playerPromises).where(eq(playerPromises.leagueId, id));
      await tx.delete(leagues).where(eq(leagues.id, id));
    });
  }

  async createPlayerPromise(data: InsertPlayerPromise): Promise<PlayerPromise> {
    const [promise] = await db.insert(playerPromises).values(data).returning();
    return promise;
  }

  async getPlayerPromisesByTeam(teamId: string): Promise<PlayerPromise[]> {
    return db.select().from(playerPromises).where(eq(playerPromises.teamId, teamId));
  }

  async getPlayerPromisesByPlayer(playerId: string): Promise<PlayerPromise[]> {
    return db.select().from(playerPromises).where(eq(playerPromises.playerId, playerId));
  }

  async getActivePromisesByLeague(leagueId: string): Promise<PlayerPromise[]> {
    return db.select().from(playerPromises).where(
      and(eq(playerPromises.leagueId, leagueId), eq(playerPromises.isActive, true))
    );
  }

  async updatePlayerPromise(id: string, data: Partial<PlayerPromise>): Promise<PlayerPromise | undefined> {
    const [updated] = await db.update(playerPromises).set(data).where(eq(playerPromises.id, id)).returning();
    return updated || undefined;
  }

  async getPendingDeparturesByLeague(leagueId: string): Promise<Player[]> {
    const leagueTeams = await this.getTeamsByLeague(leagueId);
    const teamIds = leagueTeams.map(t => t.id);
    if (teamIds.length === 0) return [];
    return db.select().from(players).where(
      and(inArray(players.teamId, teamIds), eq(players.pendingDeparture, true))
    );
  }

  async getStoryEventsByLeague(leagueId: string): Promise<StoryEvent[]> {
    return db.select().from(storyEvents)
      .where(eq(storyEvents.leagueId, leagueId))
      .orderBy(desc(storyEvents.createdAt));
  }

  async getStoryEventsByTeam(teamId: string): Promise<StoryEvent[]> {
    return db.select().from(storyEvents)
      .where(eq(storyEvents.teamId, teamId))
      .orderBy(desc(storyEvents.createdAt));
  }

  async getPendingStoryEvents(leagueId: string, teamId?: string): Promise<StoryEvent[]> {
    if (teamId) {
      return db.select().from(storyEvents)
        .where(and(
          eq(storyEvents.leagueId, leagueId),
          eq(storyEvents.teamId, teamId),
          eq(storyEvents.status, "pending"),
          eq(storyEvents.requiresChoice, true)
        ))
        .orderBy(desc(storyEvents.createdAt));
    }
    return db.select().from(storyEvents)
      .where(and(
        eq(storyEvents.leagueId, leagueId),
        eq(storyEvents.status, "pending"),
        eq(storyEvents.requiresChoice, true)
      ))
      .orderBy(desc(storyEvents.createdAt));
  }

  async createStoryEvent(event: InsertStoryEvent): Promise<StoryEvent> {
    const [created] = await db.insert(storyEvents).values(event).returning();
    return created;
  }

  async updateStoryEvent(id: string, data: Partial<StoryEvent>): Promise<StoryEvent | undefined> {
    const [updated] = await db.update(storyEvents).set(data).where(eq(storyEvents.id, id)).returning();
    return updated || undefined;
  }

  async getStoryArcsByLeague(leagueId: string): Promise<StoryArc[]> {
    return db.select().from(storyArcs)
      .where(eq(storyArcs.leagueId, leagueId))
      .orderBy(desc(storyArcs.createdAt));
  }

  async getActiveStoryArcs(leagueId: string): Promise<StoryArc[]> {
    return db.select().from(storyArcs)
      .where(and(eq(storyArcs.leagueId, leagueId), eq(storyArcs.status, "active")))
      .orderBy(desc(storyArcs.createdAt));
  }

  async createStoryArc(arc: InsertStoryArc): Promise<StoryArc> {
    const [created] = await db.insert(storyArcs).values(arc).returning();
    return created;
  }

  async updateStoryArc(id: string, data: Partial<StoryArc>): Promise<StoryArc | undefined> {
    const [updated] = await db.update(storyArcs).set(data).where(eq(storyArcs.id, id)).returning();
    return updated || undefined;
  }

  async getChaptersByArc(arcId: string): Promise<StoryArcChapter[]> {
    return db.select().from(storyArcChapters)
      .where(eq(storyArcChapters.arcId, arcId))
      .orderBy(storyArcChapters.chapterNumber);
  }

  async createStoryArcChapter(chapter: InsertStoryArcChapter): Promise<StoryArcChapter> {
    const [created] = await db.insert(storyArcChapters).values(chapter).returning();
    return created;
  }

  async updateStoryArcChapter(id: string, data: Partial<StoryArcChapter>): Promise<StoryArcChapter | undefined> {
    const [updated] = await db.update(storyArcChapters).set(data).where(eq(storyArcChapters.id, id)).returning();
    return updated || undefined;
  }

  async getMomentsByLeague(leagueId: string): Promise<Moment[]> {
    return db.select().from(moments)
      .where(eq(moments.leagueId, leagueId))
      .orderBy(desc(moments.createdAt));
  }

  async getMomentsByTeam(teamId: string): Promise<Moment[]> {
    return db.select().from(moments)
      .where(eq(moments.teamId, teamId))
      .orderBy(desc(moments.createdAt));
  }

  async createMoment(moment: InsertMoment): Promise<Moment> {
    const [created] = await db.insert(moments).values(moment).returning();
    return created;
  }

  async getPlayerSeasonStats(playerId: string, leagueId: string): Promise<PlayerSeasonStats[]> {
    return db.select().from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.leagueId, leagueId)));
  }

  async getPlayerSeasonStatsBySeason(leagueId: string, season: number): Promise<PlayerSeasonStats[]> {
    return db.select().from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.leagueId, leagueId), eq(playerSeasonStats.season, season)));
  }

  async upsertPlayerSeasonStats(data: InsertPlayerSeasonStats): Promise<PlayerSeasonStats> {
    const [existing] = await db.select().from(playerSeasonStats)
      .where(and(
        eq(playerSeasonStats.playerId, data.playerId),
        eq(playerSeasonStats.leagueId, data.leagueId),
        eq(playerSeasonStats.season, data.season)
      ));

    if (existing) {
      const [updated] = await db.update(playerSeasonStats).set({
        playerName: data.playerName,
        teamId: data.teamId,
        position: data.position,
        games: existing.games + (data.games ?? 0),
        ab: existing.ab + (data.ab ?? 0),
        r: existing.r + (data.r ?? 0),
        h: existing.h + (data.h ?? 0),
        doubles: existing.doubles + (data.doubles ?? 0),
        triples: existing.triples + (data.triples ?? 0),
        hr: existing.hr + (data.hr ?? 0),
        rbi: existing.rbi + (data.rbi ?? 0),
        bb: existing.bb + (data.bb ?? 0),
        hbp: existing.hbp + (data.hbp ?? 0),
        so: existing.so + (data.so ?? 0),
        sb: existing.sb + (data.sb ?? 0),
        cs: existing.cs + (data.cs ?? 0),
        exitVeloTotal: existing.exitVeloTotal + (data.exitVeloTotal ?? 0),
        barrels: existing.barrels + (data.barrels ?? 0),
        ballsInPlay: existing.ballsInPlay + (data.ballsInPlay ?? 0),
        hardHits: existing.hardHits + (data.hardHits ?? 0),
        pitchingGames: existing.pitchingGames + (data.pitchingGames ?? 0),
        wins: existing.wins + (data.wins ?? 0),
        losses: existing.losses + (data.losses ?? 0),
        ipOuts: existing.ipOuts + (data.ipOuts ?? 0),
        pHits: existing.pHits + (data.pHits ?? 0),
        pRuns: existing.pRuns + (data.pRuns ?? 0),
        pEr: existing.pEr + (data.pEr ?? 0),
        pBb: existing.pBb + (data.pBb ?? 0),
        pSo: existing.pSo + (data.pSo ?? 0),
        pHr: existing.pHr + (data.pHr ?? 0),
        totalPitches: existing.totalPitches + (data.totalPitches ?? 0),
        whiffs: existing.whiffs + (data.whiffs ?? 0),
        spinRateTotal: existing.spinRateTotal + (data.spinRateTotal ?? 0),
        putouts: existing.putouts + (data.putouts ?? 0),
        assists: existing.assists + (data.assists ?? 0),
        fieldingErrors: existing.fieldingErrors + (data.fieldingErrors ?? 0),
        totalChances: existing.totalChances + (data.totalChances ?? 0),
        wpa: existing.wpa + (data.wpa ?? 0),
      }).where(eq(playerSeasonStats.id, existing.id)).returning();
      return updated;
    }

    const [created] = await db.insert(playerSeasonStats).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
