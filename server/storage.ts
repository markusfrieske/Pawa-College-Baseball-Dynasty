import {
  users, leagues, conferences, teams, coaches, scouts,
  players, recruits, recruitingInterests, games, standings, auditLogs, leagueInvites, dynastyNews,
  recruitingActionsLog, recruitTopSchools, transferPortalInterests, playerHistory, playerPromises,
  playerSeasonStats, walkonPool, walkonBids,
  leagueEvents,
  advanceDigests,
  gameReports,
  recruitingClassSnapshots,
  coachSeasonHistory,
  storylineRecruits, storylineEvents, storylineVotes,
  nilSeasonEarnings,
  type NilSeasonEarning, type InsertNilSeasonEarning,
  type WalkonBid, type InsertWalkonBid,
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
  type PlayerSeasonStats, type InsertPlayerSeasonStats,
  type Walkon, type InsertWalkon,
  savedRosters, savedRecruitingClasses, recruitingClassShares,
  type SavedRoster, type InsertSavedRoster,
  type SavedRecruitingClass, type InsertSavedRecruitingClass,
  type RecruitingClassShare, type InsertRecruitingClassShare,
  type LeagueEvent, type InsertLeagueEvent,
  type AdvanceDigest, type InsertAdvanceDigest,
  type GameReport, type InsertGameReport,
  type RecruitingClassSnapshot, type InsertRecruitingClassSnapshot,
  type CoachSeasonHistory, type InsertCoachSeasonHistory,
  type StorylineRecruit, type InsertStorylineRecruit,
  type StorylineEvent, type InsertStorylineEvent,
  type StorylineVote, type InsertStorylineVote,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, or, inArray, isNotNull, isNull, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  getLeaguesByUser(userId: string): Promise<League[]>;
  getLeague(id: string): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: string, data: Partial<League>): Promise<League | undefined>;

  getConferencesByLeague(leagueId: string): Promise<Conference[]>;
  createConference(conference: InsertConference): Promise<Conference>;

  getTeamsByLeague(leagueId: string): Promise<Team[]>;
  getTeamsByLeagueIds(leagueIds: string[]): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, data: Partial<Team>): Promise<Team | undefined>;

  getCoach(id: string): Promise<Coach | undefined>;
  getCoachByTeam(teamId: string): Promise<Coach | undefined>;
  getCoachesByLeague(leagueId: string): Promise<Coach[]>;
  getCoachesByLeagueIds(leagueIds: string[]): Promise<Coach[]>;
  createCoach(coach: InsertCoach): Promise<Coach>;
  updateCoach(id: string, data: Partial<Coach>): Promise<Coach | undefined>;
  leaveLeague(coachId: string, leagueId: string, actorUserId: string): Promise<void>;
  transferCommissioner(leagueId: string, newUserId: string, currentUserId: string): Promise<void>;

  getCoachSeasonHistory(coachId: string): Promise<CoachSeasonHistory[]>;
  getCoachSeasonHistoryByLeague(leagueId: string): Promise<CoachSeasonHistory[]>;
  createCoachSeasonHistory(data: InsertCoachSeasonHistory): Promise<CoachSeasonHistory>;
  upsertCoachSeasonHistory(data: InsertCoachSeasonHistory): Promise<CoachSeasonHistory>;

  getScoutsByLeague(leagueId: string): Promise<Scout[]>;
  createScout(scout: InsertScout): Promise<Scout>;

  getPlayersByTeam(teamId: string): Promise<Player[]>;
  getPlayersByTeamIds(teamIds: string[]): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;

  getRecruitsByLeague(leagueId: string): Promise<Recruit[]>;
  getRecruitsByLeagueIds(leagueIds: string[]): Promise<Recruit[]>;
  getRecruit(id: string): Promise<Recruit | undefined>;
  createRecruit(recruit: InsertRecruit): Promise<Recruit>;
  batchCreateRecruits(recruitsData: InsertRecruit[]): Promise<Recruit[]>;
  updateRecruit(id: string, data: Partial<Recruit>): Promise<Recruit | undefined>;
  deleteRecruitsByLeague(leagueId: string): Promise<void>;

  getWalkonsByLeague(leagueId: string): Promise<Walkon[]>;
  createWalkon(walkon: InsertWalkon): Promise<Walkon>;
  updateWalkon(id: string, data: Partial<Walkon>): Promise<Walkon | undefined>;
  deleteWalkonsByLeague(leagueId: string): Promise<void>;

  getWalkonBidsByLeague(leagueId: string): Promise<WalkonBid[]>;
  getWalkonBidsByTeam(leagueId: string, teamId: string): Promise<WalkonBid[]>;
  getWalkonBidsByWalkon(walkonPoolId: string): Promise<WalkonBid[]>;
  upsertWalkonBid(leagueId: string, walkonPoolId: string, teamId: string, bidAmount: number): Promise<WalkonBid>;
  deleteWalkonBid(walkonPoolId: string, teamId: string): Promise<void>;
  deleteWalkonBidsByLeague(leagueId: string): Promise<void>;

  getRecruitingInterestsByTeam(teamId: string): Promise<RecruitingInterest[]>;
  getRecruitingInterestsByLeague(leagueId: string): Promise<RecruitingInterest[]>;
  getRecruitingInterestsByRecruit(recruitId: string): Promise<RecruitingInterest[]>;
  getRecruitingInterest(recruitId: string, teamId: string): Promise<RecruitingInterest | undefined>;
  createRecruitingInterest(interest: InsertRecruitingInterest): Promise<RecruitingInterest>;
  updateRecruitingInterest(id: string, data: Partial<RecruitingInterest>): Promise<RecruitingInterest | undefined>;

  getGame(id: string): Promise<Game | undefined>;
  getGamesByLeague(leagueId: string): Promise<Game[]>;
  getGamesByLeagueSeason(leagueId: string, season: number): Promise<Game[]>;
  getPlayersByLeague(leagueId: string): Promise<Player[]>;
  getGamesByTeam(teamId: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, data: Partial<Game>): Promise<Game | undefined>;

  getStandingsByLeague(leagueId: string, season: number): Promise<Standings[]>;
  getAllStandingsByLeague(leagueId: string): Promise<Standings[]>;
  getStandingsByTeam(teamId: string): Promise<Standings[]>;
  createStandings(standings: InsertStandings): Promise<Standings>;
  updateStandings(id: string, data: Partial<Standings>): Promise<Standings | undefined>;
  incrementStandingsForGame(leagueId: string, season: number, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number, isConference?: boolean): Promise<void>;

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

  createLeagueEvent(event: InsertLeagueEvent): Promise<LeagueEvent>;
  getLeagueEvents(leagueId: string, limit?: number, eventType?: string): Promise<LeagueEvent[]>;
  getLeagueEventsBySeason(leagueId: string, season: number, eventType?: string): Promise<LeagueEvent[]>;
  getLeagueEventsByTeam(teamId: string, eventType: string, limit?: number): Promise<LeagueEvent[]>;

  createAdvanceDigest(digest: InsertAdvanceDigest): Promise<AdvanceDigest>;
  getAdvanceDigestsByLeague(leagueId: string, limit?: number): Promise<AdvanceDigest[]>;
  getLatestAdvanceDigest(leagueId: string): Promise<AdvanceDigest | undefined>;
  getAdvanceDigest(id: string): Promise<AdvanceDigest | undefined>;

  getRecruitingActionsLog(recruitId: string, teamId: string): Promise<RecruitingActionsLog[]>;
  getRecruitingActionsLogByTeam(teamId: string, leagueId: string): Promise<RecruitingActionsLog[]>;
  getRecruitingActionsLogByLeagueWeek(leagueId: string, season: number, week: number): Promise<RecruitingActionsLog[]>;
  getSeasonVisitCount(teamId: string, leagueId: string, season: number): Promise<{ total: number; campusVisits: number; hcVisits: number }>;
  createRecruitingAction(action: InsertRecruitingActionsLog): Promise<RecruitingActionsLog>;

  getRecruitTopSchools(recruitId: string): Promise<RecruitTopSchools[]>;
  getRecruitTopSchoolsByLeague(leagueId: string): Promise<RecruitTopSchools[]>;
  getRecruitTopSchool(recruitId: string, teamId: string): Promise<RecruitTopSchools | undefined>;
  getTopSchoolsByTeam(teamId: string): Promise<RecruitTopSchools[]>;
  createRecruitTopSchool(topSchool: InsertRecruitTopSchools): Promise<RecruitTopSchools>;
  batchCreateRecruitTopSchools(topSchools: InsertRecruitTopSchools[]): Promise<void>;
  updateRecruitTopSchool(id: string, data: Partial<RecruitTopSchools>): Promise<RecruitTopSchools | undefined>;
  snapshotTopSchoolsInterestForLeague(leagueId: string): Promise<void>;
  
  updatePlayer(id: string, data: Partial<Player>): Promise<Player | undefined>;
  bulkUpdatePlayerRest(updates: Array<{id: string; lastPitchedOuts: number; lastPitchedWeek: number; lastPitchedDay: string}>): Promise<void>;
  resetPitcherRestForLeague(leagueId: string): Promise<void>;
  batchUpdatePlayersLineup(updates: Array<{id: string; data: Partial<Player>}>): Promise<void>;
  getPlayer(id: string): Promise<Player | undefined>;
  clearProgressionDeltasForLeague(leagueId: string): Promise<number>;
  
  getTransferPortalPlayersByLeague(leagueId: string): Promise<Player[]>;
  getTransferPortalInterestsByTeam(teamId: string): Promise<TransferPortalInterest[]>;
  getTransferPortalInterest(playerId: string, teamId: string): Promise<TransferPortalInterest | undefined>;
  createTransferPortalInterest(interest: InsertTransferPortalInterest): Promise<TransferPortalInterest>;
  updateTransferPortalInterest(id: string, data: Partial<TransferPortalInterest>): Promise<TransferPortalInterest | undefined>;
  deleteTransferPortalInterestsByPlayer(playerId: string): Promise<void>;

  deletePlayer(id: string): Promise<void>;
  batchDeletePlayers(ids: string[]): Promise<void>;
  createPlayerHistory(data: InsertPlayerHistory): Promise<PlayerHistory>;
  batchCreatePlayerHistories(records: InsertPlayerHistory[]): Promise<void>;
  computeLeaguePowerRankings(leagueId: string): Promise<Array<{ teamId: string; rank: number }>>;
  getPlayerHistoryByLeague(leagueId: string): Promise<PlayerHistory[]>;
  getPlayerHistoryByTeam(teamId: string): Promise<PlayerHistory[]>;
  deleteLeague(id: string): Promise<void>;

  createPlayerPromise(data: InsertPlayerPromise): Promise<PlayerPromise>;
  getPlayerPromisesByTeam(teamId: string): Promise<PlayerPromise[]>;
  getPlayerPromisesByPlayer(playerId: string): Promise<PlayerPromise[]>;
  getActivePromisesByLeague(leagueId: string): Promise<PlayerPromise[]>;
  updatePlayerPromise(id: string, data: Partial<PlayerPromise>): Promise<PlayerPromise | undefined>;
  getPendingDeparturesByLeague(leagueId: string): Promise<Player[]>;

  getPlayerSeasonStats(playerId: string, leagueId: string): Promise<PlayerSeasonStats[]>;
  getPlayerSeasonStatsBySeason(leagueId: string, season: number): Promise<PlayerSeasonStats[]>;
  getAllPlayerSeasonStatsByLeague(leagueId: string): Promise<PlayerSeasonStats[]>;
  getLatestPlayerSeasonStatsByIds(leagueId: string, playerIds: string[]): Promise<PlayerSeasonStats[]>;
  upsertPlayerSeasonStats(data: InsertPlayerSeasonStats): Promise<PlayerSeasonStats>;
  updatePlayerSeasonStatsPosition(playerId: string, leagueId: string, season: number, position: string): Promise<void>;
  setPlayerSeasonStatsOvr(playerId: string, leagueId: string, season: number, ovr: number): Promise<void>;

  getSavedRostersByUser(userId: string): Promise<SavedRoster[]>;
  getSavedRoster(id: string): Promise<SavedRoster | undefined>;
  createSavedRoster(data: InsertSavedRoster): Promise<SavedRoster>;
  updateSavedRoster(id: string, data: Partial<SavedRoster>): Promise<SavedRoster | undefined>;
  deleteSavedRoster(id: string): Promise<void>;

  getSavedRecruitingClassesByUser(userId: string): Promise<SavedRecruitingClass[]>;
  getSavedRecruitingClass(id: string): Promise<SavedRecruitingClass | undefined>;
  createSavedRecruitingClass(data: InsertSavedRecruitingClass): Promise<SavedRecruitingClass>;
  updateSavedRecruitingClass(id: string, data: Partial<SavedRecruitingClass>): Promise<SavedRecruitingClass | undefined>;
  deleteSavedRecruitingClass(id: string): Promise<void>;

  createClassShare(data: { classId: string; userId: string; token: string; label?: string }): Promise<RecruitingClassShare>;
  getClassShareByToken(token: string): Promise<RecruitingClassShare | undefined>;
  getClassSharesByClassId(classId: string, userId: string): Promise<RecruitingClassShare[]>;
  revokeClassShare(shareId: string, userId: string): Promise<void>;
  incrementClassShareImportCount(shareId: string): Promise<void>;

  // Game reports (manual reporting)
  getGameReport(gameId: string): Promise<GameReport | undefined>;
  getGameReportsByLeague(leagueId: string): Promise<GameReport[]>;
  getDisputedReports(leagueId: string): Promise<GameReport[]>;
  getPendingReportsForTeam(leagueId: string, teamId: string): Promise<GameReport[]>;
  createGameReport(data: InsertGameReport): Promise<GameReport>;
  updateGameReport(id: string, data: Partial<GameReport>): Promise<GameReport | undefined>;

  // Recruiting class snapshots
  createRecruitingClassSnapshot(data: InsertRecruitingClassSnapshot): Promise<RecruitingClassSnapshot>;
  getRecruitingClassSnapshotsByLeague(leagueId: string, season: number): Promise<RecruitingClassSnapshot[]>;
  getRecruitingClassSnapshotsAllSeasons(leagueId: string): Promise<RecruitingClassSnapshot[]>;

  // Storyline system
  getStorylineRecruitsByLeague(leagueId: string, season?: number): Promise<StorylineRecruit[]>;
  getStorylineRecruit(id: string): Promise<StorylineRecruit | undefined>;
  getStorylineRecruitByRecruitId(recruitId: string): Promise<StorylineRecruit | undefined>;
  createStorylineRecruit(data: InsertStorylineRecruit): Promise<StorylineRecruit>;
  updateStorylineRecruit(id: string, data: Partial<StorylineRecruit>): Promise<StorylineRecruit | undefined>;
  deleteStorylineRecruitsByLeague(leagueId: string, season: number): Promise<void>;
  deleteStorylineEventsByLeague(leagueId: string, season: number): Promise<void>;

  getStorylineEventsByLeague(leagueId: string, season?: number): Promise<StorylineEvent[]>;
  getStorylineEventsByRecruit(storylineRecruitId: string): Promise<StorylineEvent[]>;
  getUnresolvedStorylineEvents(leagueId: string, season: number): Promise<StorylineEvent[]>;
  getStorylineEvent(id: string): Promise<StorylineEvent | undefined>;
  createStorylineEvent(data: InsertStorylineEvent): Promise<StorylineEvent>;
  updateStorylineEvent(id: string, data: Partial<StorylineEvent>): Promise<StorylineEvent | undefined>;
  getFirstStorylineEventImageByTemplateId(templateId: string): Promise<string | null>;
  getStorylineEventsWithMissingImages(): Promise<StorylineEvent[]>;
  updateStorylineEventImageByTemplateId(templateId: string, imageUrl: string): Promise<void>;
  setStorylineEventImageByLeagueAndTemplate(leagueId: string, templateId: string, imageUrl: string): Promise<void>;

  getStorylineVotesByEvent(eventId: string): Promise<StorylineVote[]>;
  getStorylineVoteByTeam(eventId: string, teamId: string): Promise<StorylineVote | undefined>;
  createStorylineVote(data: InsertStorylineVote): Promise<StorylineVote>;
  updateStorylineVote(id: string, data: Partial<StorylineVote>): Promise<StorylineVote | undefined>;

  // NIL season earnings
  createNilSeasonEarning(data: InsertNilSeasonEarning): Promise<NilSeasonEarning>;
  getNilEarningsByTeam(leagueId: string, teamId: string, season: number): Promise<NilSeasonEarning[]>;
  getNilEarningsByLeague(leagueId: string, season: number): Promise<NilSeasonEarning[]>;
  hasNilEarningCategory(leagueId: string, teamId: string, category: string): Promise<boolean>;

  getPlayerCountsByLeague(leagueId: string): Promise<Map<string, number>>;
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

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
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
    const payload: Partial<League> = { ...data };
    if ("currentPhase" in payload && !("phaseDeadline" in payload)) {
      payload.phaseDeadline = null;
    }
    const [league] = await db.update(leagues).set(payload).where(eq(leagues.id, id)).returning();
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

  async getTeamsByLeagueIds(leagueIds: string[]): Promise<Team[]> {
    if (leagueIds.length === 0) return [];
    return await db.select().from(teams).where(inArray(teams.leagueId, leagueIds));
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

  async getCoachesByLeagueIds(leagueIds: string[]): Promise<Coach[]> {
    if (leagueIds.length === 0) return [];
    return await db.select().from(coaches).where(inArray(coaches.leagueId, leagueIds));
  }

  async createCoach(insertCoach: InsertCoach): Promise<Coach> {
    const [coach] = await db.insert(coaches).values(insertCoach).returning();
    return coach;
  }

  async updateCoach(id: string, data: Partial<Coach>): Promise<Coach | undefined> {
    const [coach] = await db.update(coaches).set(data).where(eq(coaches.id, id)).returning();
    return coach;
  }

  async getCoachSeasonHistory(coachId: string): Promise<CoachSeasonHistory[]> {
    return db.select().from(coachSeasonHistory)
      .where(eq(coachSeasonHistory.coachId, coachId))
      .orderBy(desc(coachSeasonHistory.season));
  }

  async getCoachSeasonHistoryByLeague(leagueId: string): Promise<CoachSeasonHistory[]> {
    return db.select().from(coachSeasonHistory)
      .where(eq(coachSeasonHistory.leagueId, leagueId))
      .orderBy(desc(coachSeasonHistory.season));
  }

  async createCoachSeasonHistory(data: InsertCoachSeasonHistory): Promise<CoachSeasonHistory> {
    const [row] = await db.insert(coachSeasonHistory).values(data).returning();
    return row;
  }

  async upsertCoachSeasonHistory(data: InsertCoachSeasonHistory): Promise<CoachSeasonHistory> {
    const existing = await db.select().from(coachSeasonHistory)
      .where(and(
        eq(coachSeasonHistory.coachId, data.coachId),
        eq(coachSeasonHistory.season, data.season),
        eq(coachSeasonHistory.leagueId, data.leagueId),
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(coachSeasonHistory)
        .set(data)
        .where(eq(coachSeasonHistory.id, existing[0].id))
        .returning();
      return updated;
    }
    return this.createCoachSeasonHistory(data);
  }

  async leaveLeague(coachId: string, leagueId: string, actorUserId: string): Promise<void> {
    const [coach] = await db.select().from(coaches).where(eq(coaches.id, coachId));
    if (!coach) return;
    const isForced = coach.userId !== actorUserId;
    if (coach.teamId) {
      await db.update(teams).set({ isCpu: true, coachId: null }).where(eq(teams.id, coach.teamId));
    }
    await db.delete(coaches).where(eq(coaches.id, coachId));
    if (isForced) {
      await db.insert(auditLogs).values({
        leagueId,
        userId: actorUserId,
        action: "Coach Removed By Commissioner",
        details: `Coach ${coach.firstName} ${coach.lastName} was removed from the league by the commissioner. Their team has been converted to CPU control.`,
      });
      await db.insert(leagueEvents).values({
        leagueId,
        eventType: "coach_removed",
        title: "Coach Removed",
        description: `${coach.firstName} ${coach.lastName} was removed from the dynasty by the commissioner. Their team is now CPU-controlled.`,
      });
    } else {
      await db.insert(auditLogs).values({
        leagueId,
        userId: actorUserId,
        action: "Coach Left League",
        details: `Coach ${coach.firstName} ${coach.lastName} left the league. Their team has been converted to CPU control.`,
      });
      await db.insert(leagueEvents).values({
        leagueId,
        eventType: "coach_left",
        title: "Coach Left the Dynasty",
        description: `${coach.firstName} ${coach.lastName} has left the dynasty. Their team is now CPU-controlled.`,
      });
    }
  }

  async transferCommissioner(leagueId: string, newUserId: string, currentUserId: string): Promise<void> {
    const [newCoach] = await db.select().from(coaches)
      .where(and(eq(coaches.leagueId, leagueId), eq(coaches.userId, newUserId)));
    await db.update(leagues).set({ commissionerId: newUserId }).where(eq(leagues.id, leagueId));
    await db.insert(auditLogs).values({
      leagueId,
      userId: currentUserId,
      action: "Commissioner Role Transferred",
      details: `Commissioner role transferred to ${newCoach ? `${newCoach.firstName} ${newCoach.lastName}` : newUserId}.`,
    });
    await db.insert(leagueEvents).values({
      leagueId,
      eventType: "commissioner_transfer",
      title: "Commissioner Role Transferred",
      description: `The commissioner role has been handed off to ${newCoach ? `${newCoach.firstName} ${newCoach.lastName}` : "a new coach"}.`,
    });
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

  async getPlayersByTeamIds(teamIds: string[]): Promise<Player[]> {
    if (teamIds.length === 0) return [];
    return await db.select().from(players).where(inArray(players.teamId, teamIds));
  }

  async getPlayerCountsByLeague(leagueId: string): Promise<Map<string, number>> {
    const leagueTeams = await this.getTeamsByLeague(leagueId);
    if (leagueTeams.length === 0) return new Map();
    const teamIds = leagueTeams.map((t) => t.id);
    const rows = await db
      .select({ teamId: players.teamId, count: sql<number>`cast(count(*) as int)` })
      .from(players)
      .where(inArray(players.teamId, teamIds))
      .groupBy(players.teamId);
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.teamId, row.count);
    return map;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db.insert(players).values(insertPlayer).returning();
    return player;
  }

  async getRecruitsByLeague(leagueId: string): Promise<Recruit[]> {
    return await db.select().from(recruits).where(eq(recruits.leagueId, leagueId));
  }

  async getRecruitsByLeagueIds(leagueIds: string[]): Promise<Recruit[]> {
    if (leagueIds.length === 0) return [];
    return await db.select().from(recruits).where(inArray(recruits.leagueId, leagueIds));
  }

  async getRecruit(id: string): Promise<Recruit | undefined> {
    const [recruit] = await db.select().from(recruits).where(eq(recruits.id, id));
    return recruit || undefined;
  }

  async createRecruit(insertRecruit: InsertRecruit): Promise<Recruit> {
    const [recruit] = await db.insert(recruits).values(insertRecruit).returning();
    return recruit;
  }

  async batchCreateRecruits(recruitsData: InsertRecruit[]): Promise<Recruit[]> {
    if (recruitsData.length === 0) return [];
    const CHUNK = 100;
    const results: Recruit[] = [];
    for (let i = 0; i < recruitsData.length; i += CHUNK) {
      const chunk = await db.insert(recruits).values(recruitsData.slice(i, i + CHUNK)).returning();
      results.push(...chunk);
    }
    return results;
  }

  async updateRecruit(id: string, data: Partial<Recruit>): Promise<Recruit | undefined> {
    const [recruit] = await db.update(recruits).set(data).where(eq(recruits.id, id)).returning();
    return recruit || undefined;
  }

  async deleteRecruitsByLeague(leagueId: string): Promise<void> {
    const leagueRecruits = await db.select({ id: recruits.id }).from(recruits).where(eq(recruits.leagueId, leagueId));
    const recruitIds = leagueRecruits.map(r => r.id);
    if (recruitIds.length > 0) {
      await db.delete(recruitTopSchools).where(inArray(recruitTopSchools.recruitId, recruitIds));
      await db.delete(recruitingActionsLog).where(inArray(recruitingActionsLog.recruitId, recruitIds));
      await db.delete(recruitingInterests).where(inArray(recruitingInterests.recruitId, recruitIds));
      const srRows = await db.select({ id: storylineRecruits.id }).from(storylineRecruits).where(inArray(storylineRecruits.recruitId, recruitIds));
      const srIds = srRows.map(r => r.id);
      if (srIds.length > 0) {
        const evRows = await db.select({ id: storylineEvents.id }).from(storylineEvents).where(inArray(storylineEvents.storylineRecruitId, srIds));
        const evIds = evRows.map(e => e.id);
        if (evIds.length > 0) {
          await db.delete(storylineVotes).where(inArray(storylineVotes.eventId, evIds));
          await db.delete(storylineEvents).where(inArray(storylineEvents.id, evIds));
        }
        await db.delete(storylineRecruits).where(inArray(storylineRecruits.id, srIds));
      }
    }
    await db.delete(recruits).where(eq(recruits.leagueId, leagueId));
  }

  async getWalkonsByLeague(leagueId: string): Promise<Walkon[]> {
    return await db.select().from(walkonPool).where(eq(walkonPool.leagueId, leagueId));
  }

  async createWalkon(insertWalkon: InsertWalkon): Promise<Walkon> {
    const [walkon] = await db.insert(walkonPool).values(insertWalkon).returning();
    return walkon;
  }

  async updateWalkon(id: string, data: Partial<Walkon>): Promise<Walkon | undefined> {
    const [walkon] = await db.update(walkonPool).set(data).where(eq(walkonPool.id, id)).returning();
    return walkon || undefined;
  }

  async deleteWalkonsByLeague(leagueId: string): Promise<void> {
    await db.delete(walkonBids).where(eq(walkonBids.leagueId, leagueId));
    await db.delete(walkonPool).where(eq(walkonPool.leagueId, leagueId));
  }

  async getWalkonBidsByLeague(leagueId: string): Promise<WalkonBid[]> {
    return await db.select().from(walkonBids).where(eq(walkonBids.leagueId, leagueId));
  }

  async getWalkonBidsByTeam(leagueId: string, teamId: string): Promise<WalkonBid[]> {
    return await db.select().from(walkonBids).where(
      and(eq(walkonBids.leagueId, leagueId), eq(walkonBids.teamId, teamId))
    );
  }

  async getWalkonBidsByWalkon(walkonPoolId: string): Promise<WalkonBid[]> {
    return await db.select().from(walkonBids).where(eq(walkonBids.walkonPoolId, walkonPoolId));
  }

  async upsertWalkonBid(leagueId: string, walkonPoolId: string, teamId: string, bidAmount: number): Promise<WalkonBid> {
    const existing = await db.select().from(walkonBids).where(
      and(eq(walkonBids.walkonPoolId, walkonPoolId), eq(walkonBids.teamId, teamId))
    );
    if (existing.length > 0) {
      // Only update bidAmount — intentionally preserve original createdAt so that
      // tie-break order ("first to submit wins") is based on when the team first
      // bid on this walk-on, not the most recent edit.
      const [updated] = await db.update(walkonBids)
        .set({ bidAmount })
        .where(and(eq(walkonBids.walkonPoolId, walkonPoolId), eq(walkonBids.teamId, teamId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(walkonBids).values({ leagueId, walkonPoolId, teamId, bidAmount }).returning();
    return created;
  }

  async deleteWalkonBid(walkonPoolId: string, teamId: string): Promise<void> {
    await db.delete(walkonBids).where(
      and(eq(walkonBids.walkonPoolId, walkonPoolId), eq(walkonBids.teamId, teamId))
    );
  }

  async deleteWalkonBidsByLeague(leagueId: string): Promise<void> {
    await db.delete(walkonBids).where(eq(walkonBids.leagueId, leagueId));
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

  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game || undefined;
  }

  async getGamesByLeague(leagueId: string): Promise<Game[]> {
    return await db.select().from(games).where(eq(games.leagueId, leagueId));
  }

  async getGamesByLeagueSeason(leagueId: string, season: number): Promise<Game[]> {
    return await db.select().from(games).where(
      and(eq(games.leagueId, leagueId), eq(games.season, season))
    );
  }

  async getPlayersByLeague(leagueId: string): Promise<Player[]> {
    const teams = await this.getTeamsByLeague(leagueId);
    if (teams.length === 0) return [];
    const teamIds = teams.map(t => t.id);
    return await db.select().from(players).where(inArray(players.teamId, teamIds));
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

  async getAllStandingsByLeague(leagueId: string): Promise<Standings[]> {
    return await db.select().from(standings)
      .where(eq(standings.leagueId, leagueId))
      .orderBy(standings.season);
  }

  async getStandingsByTeam(teamId: string): Promise<Standings[]> {
    return await db.select().from(standings)
      .where(eq(standings.teamId, teamId))
      .orderBy(standings.season);
  }

  async createStandings(insertStandings: InsertStandings): Promise<Standings> {
    const [standing] = await db.insert(standings).values(insertStandings).returning();
    return standing;
  }

  async updateStandings(id: string, data: Partial<Standings>): Promise<Standings | undefined> {
    const [standing] = await db.update(standings).set(data).where(eq(standings.id, id)).returning();
    return standing || undefined;
  }

  async incrementStandingsForGame(leagueId: string, season: number, homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number, isConference: boolean = false): Promise<void> {
    const homeWon = homeScore > awayScore;
    // Ensure rows exist (defensive: should be pre-created at season start)
    let [homeRow] = await db.select().from(standings).where(and(eq(standings.leagueId, leagueId), eq(standings.teamId, homeTeamId), eq(standings.season, season)));
    if (!homeRow) homeRow = await this.createStandings({ leagueId, teamId: homeTeamId, season });
    let [awayRow] = await db.select().from(standings).where(and(eq(standings.leagueId, leagueId), eq(standings.teamId, awayTeamId), eq(standings.season, season)));
    if (!awayRow) awayRow = await this.createStandings({ leagueId, teamId: awayTeamId, season });
    // Atomic SQL-level increments — safe when multiple games update the same team concurrently
    await db.update(standings).set({
      wins: sql`${standings.wins} + ${homeWon ? 1 : 0}`,
      losses: sql`${standings.losses} + ${homeWon ? 0 : 1}`,
      conferenceWins: sql`${standings.conferenceWins} + ${isConference && homeWon ? 1 : 0}`,
      conferenceLosses: sql`${standings.conferenceLosses} + ${isConference && !homeWon ? 1 : 0}`,
      runsScored: sql`${standings.runsScored} + ${homeScore}`,
      runsAllowed: sql`${standings.runsAllowed} + ${awayScore}`,
    }).where(eq(standings.id, homeRow.id));
    await db.update(standings).set({
      wins: sql`${standings.wins} + ${homeWon ? 0 : 1}`,
      losses: sql`${standings.losses} + ${homeWon ? 1 : 0}`,
      conferenceWins: sql`${standings.conferenceWins} + ${isConference && !homeWon ? 1 : 0}`,
      conferenceLosses: sql`${standings.conferenceLosses} + ${isConference && homeWon ? 1 : 0}`,
      runsScored: sql`${standings.runsScored} + ${awayScore}`,
      runsAllowed: sql`${standings.runsAllowed} + ${homeScore}`,
    }).where(eq(standings.id, awayRow.id));
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

  async createLeagueEvent(event: InsertLeagueEvent): Promise<LeagueEvent> {
    const [e] = await db.insert(leagueEvents).values(event).returning();
    return e;
  }

  async getLeagueEvents(leagueId: string, limit = 100, eventType?: string): Promise<LeagueEvent[]> {
    if (eventType) {
      return await db.select().from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, leagueId), eq(leagueEvents.eventType, eventType)))
        .orderBy(desc(leagueEvents.createdAt))
        .limit(limit);
    }
    return await db.select().from(leagueEvents)
      .where(eq(leagueEvents.leagueId, leagueId))
      .orderBy(desc(leagueEvents.createdAt))
      .limit(limit);
  }

  async getLeagueEventsBySeason(leagueId: string, season: number, eventType?: string): Promise<LeagueEvent[]> {
    if (eventType) {
      return await db.select().from(leagueEvents)
        .where(and(
          eq(leagueEvents.leagueId, leagueId),
          eq(leagueEvents.season, season),
          eq(leagueEvents.eventType, eventType),
        ))
        .orderBy(desc(leagueEvents.createdAt));
    }
    return await db.select().from(leagueEvents)
      .where(and(eq(leagueEvents.leagueId, leagueId), eq(leagueEvents.season, season)))
      .orderBy(desc(leagueEvents.createdAt));
  }

  async getLeagueEventsByTeam(teamId: string, eventType: string, limit = 50): Promise<LeagueEvent[]> {
    return await db.select().from(leagueEvents)
      .where(and(eq(leagueEvents.teamId, teamId), eq(leagueEvents.eventType, eventType)))
      .orderBy(desc(leagueEvents.createdAt))
      .limit(limit);
  }

  async createAdvanceDigest(digest: InsertAdvanceDigest): Promise<AdvanceDigest> {
    const [d] = await db.insert(advanceDigests).values(digest).returning();
    return d;
  }

  async getAdvanceDigestsByLeague(leagueId: string, limit = 50): Promise<AdvanceDigest[]> {
    return await db.select().from(advanceDigests)
      .where(eq(advanceDigests.leagueId, leagueId))
      .orderBy(desc(advanceDigests.windowEnd))
      .limit(limit);
  }

  async getLatestAdvanceDigest(leagueId: string): Promise<AdvanceDigest | undefined> {
    const [d] = await db.select().from(advanceDigests)
      .where(eq(advanceDigests.leagueId, leagueId))
      .orderBy(desc(advanceDigests.windowEnd))
      .limit(1);
    return d;
  }

  async getAdvanceDigest(id: string): Promise<AdvanceDigest | undefined> {
    const [d] = await db.select().from(advanceDigests).where(eq(advanceDigests.id, id));
    return d;
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

  async getRecruitingActionsLogByLeagueWeek(leagueId: string, season: number, week: number): Promise<RecruitingActionsLog[]> {
    return await db.select().from(recruitingActionsLog)
      .where(and(
        eq(recruitingActionsLog.leagueId, leagueId),
        eq(recruitingActionsLog.season, season),
        eq(recruitingActionsLog.week, week),
      ));
  }

  async getSeasonVisitCount(teamId: string, leagueId: string, season: number): Promise<{ total: number; campusVisits: number; hcVisits: number }> {
    const rows = await db.select().from(recruitingActionsLog)
      .where(and(
        eq(recruitingActionsLog.teamId, teamId),
        eq(recruitingActionsLog.leagueId, leagueId),
        eq(recruitingActionsLog.season, season),
        inArray(recruitingActionsLog.actionType, ["visit", "head_coach_visit"]),
      ));
    const campusVisits = rows.filter(r => r.actionType === "visit").length;
    const hcVisits = rows.filter(r => r.actionType === "head_coach_visit").length;
    return { total: campusVisits + hcVisits, campusVisits, hcVisits };
  }

  async createRecruitingAction(action: InsertRecruitingActionsLog): Promise<RecruitingActionsLog> {
    const [log] = await db.insert(recruitingActionsLog).values(action).returning();
    return log;
  }

  async getRecruitTopSchools(recruitId: string): Promise<RecruitTopSchools[]> {
    return await db.select().from(recruitTopSchools)
      .where(eq(recruitTopSchools.recruitId, recruitId));
  }

  async getRecruitTopSchoolsByLeague(leagueId: string): Promise<RecruitTopSchools[]> {
    return await db.select({ ...recruitTopSchools })
      .from(recruitTopSchools)
      .innerJoin(recruits, eq(recruitTopSchools.recruitId, recruits.id))
      .where(eq(recruits.leagueId, leagueId));
  }

  async getRecruitTopSchool(recruitId: string, teamId: string): Promise<RecruitTopSchools | undefined> {
    const [topSchool] = await db.select().from(recruitTopSchools)
      .where(and(eq(recruitTopSchools.recruitId, recruitId), eq(recruitTopSchools.teamId, teamId)));
    return topSchool || undefined;
  }

  async getTopSchoolsByTeam(teamId: string): Promise<RecruitTopSchools[]> {
    return await db.select().from(recruitTopSchools)
      .where(eq(recruitTopSchools.teamId, teamId));
  }

  async createRecruitTopSchool(topSchool: InsertRecruitTopSchools): Promise<RecruitTopSchools> {
    const [created] = await db.insert(recruitTopSchools).values(topSchool).returning();
    return created;
  }

  async batchCreateRecruitTopSchools(topSchoolsData: InsertRecruitTopSchools[]): Promise<void> {
    if (topSchoolsData.length === 0) return;
    const CHUNK = 200;
    for (let i = 0; i < topSchoolsData.length; i += CHUNK) {
      await db.insert(recruitTopSchools).values(topSchoolsData.slice(i, i + CHUNK));
    }
  }

  async updateRecruitTopSchool(id: string, data: Partial<RecruitTopSchools>): Promise<RecruitTopSchools | undefined> {
    const [updated] = await db.update(recruitTopSchools).set(data).where(eq(recruitTopSchools.id, id)).returning();
    return updated || undefined;
  }

  async snapshotTopSchoolsInterestForLeague(leagueId: string): Promise<void> {
    await db.execute(
      sql`UPDATE recruit_top_schools rts
          SET previous_interest_level = LEAST(100, rts.interest_level + rts.accumulated_interest)
          FROM recruits r
          WHERE rts.recruit_id = r.id AND r.league_id = ${leagueId}`
    );
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async updatePlayer(id: string, data: Partial<Player>): Promise<Player | undefined> {
    const [player] = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return player || undefined;
  }

  async bulkUpdatePlayerRest(updates: Array<{id: string; lastPitchedOuts: number; lastPitchedWeek: number; lastPitchedDay: string}>): Promise<void> {
    if (updates.length === 0) return;
    const outsWhen = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.lastPitchedOuts}::integer`), sql` `);
    const weekWhen = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.lastPitchedWeek}::integer`), sql` `);
    const dayWhen  = sql.join(updates.map(u => sql`WHEN ${u.id} THEN ${u.lastPitchedDay}`), sql` `);
    const ids = sql.join(updates.map(u => sql`${u.id}`), sql`, `);
    await db.execute(sql`
      UPDATE players
      SET last_pitched_outs  = CASE id ${outsWhen} END,
          last_pitched_week  = CASE id ${weekWhen} END,
          last_pitched_day   = CASE id ${dayWhen}  END
      WHERE id IN (${ids})
    `);
  }

  async resetPitcherRestForLeague(leagueId: string): Promise<void> {
    await db.execute(sql`
      UPDATE players
      SET last_pitched_outs = 0,
          last_pitched_week = NULL,
          last_pitched_day  = NULL
      WHERE team_id IN (
        SELECT id FROM teams WHERE league_id = ${leagueId}
      )
    `);
  }

  async batchUpdatePlayersLineup(updates: Array<{id: string; data: Partial<Player>}>): Promise<void> {
    if (updates.length === 0) return;

    // Split into two groups so we can emit at most 2 SQL statements
    const positionUpdates = updates.filter(u => 'battingOrder' in u.data || 'lineupPosition' in u.data);
    const pitcherUpdates  = updates.filter(u => 'pitchingRole' in u.data);

    await db.transaction(async (tx) => {
      if (positionUpdates.length > 0) {
        // Build a single UPDATE … SET … CASE WHEN for all position players
        // battingOrder must be cast to integer — Drizzle binds JS values as text by default
        const battingWhen = sql.join(
          positionUpdates.map(u => sql`WHEN ${u.id} THEN ${u.data.battingOrder ?? null}::integer`),
          sql` `,
        );
        const lineupWhen = sql.join(
          positionUpdates.map(u => sql`WHEN ${u.id} THEN ${u.data.lineupPosition ?? null}`),
          sql` `,
        );
        const posIds = sql.join(positionUpdates.map(u => sql`${u.id}`), sql`, `);

        await tx.execute(sql`
          UPDATE players
          SET batting_order    = CASE id ${battingWhen} END,
              lineup_position  = CASE id ${lineupWhen}  END
          WHERE id IN (${posIds})
        `);
      }

      if (pitcherUpdates.length > 0) {
        const roleWhen = sql.join(
          pitcherUpdates.map(u => sql`WHEN ${u.id} THEN ${u.data.pitchingRole ?? null}`),
          sql` `,
        );
        const pitIds = sql.join(pitcherUpdates.map(u => sql`${u.id}`), sql`, `);

        await tx.execute(sql`
          UPDATE players
          SET pitching_role = CASE id ${roleWhen} END
          WHERE id IN (${pitIds})
        `);
      }
    });
  }

  async clearProgressionDeltasForLeague(leagueId: string): Promise<number> {
    const leagueTeams = await this.getTeamsByLeague(leagueId);
    const teamIds = leagueTeams.map(t => t.id);
    if (teamIds.length === 0) return 0;
    await db.update(players)
      .set({ progressionDeltas: sql`NULL` } as any)
      .where(
        and(
          inArray(players.teamId, teamIds),
          isNotNull(players.progressionDeltas)
        )
      );
    return teamIds.length;
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
    await db.delete(players).where(eq(players.id, id));
  }

  async batchDeletePlayers(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(transferPortalInterests).where(inArray(transferPortalInterests.playerId, ids));
    await db.delete(playerPromises).where(inArray(playerPromises.playerId, ids));
    await db.delete(players).where(inArray(players.id, ids));
  }

  async createPlayerHistory(data: InsertPlayerHistory): Promise<PlayerHistory> {
    const [history] = await db.insert(playerHistory).values(data).returning();
    return history;
  }

  async batchCreatePlayerHistories(records: InsertPlayerHistory[]): Promise<void> {
    if (records.length === 0) return;
    const CHUNK = 100;
    for (let i = 0; i < records.length; i += CHUNK) {
      await db.insert(playerHistory).values(records.slice(i, i + CHUNK));
    }
  }

  async computeLeaguePowerRankings(leagueId: string): Promise<Array<{ teamId: string; rank: number }>> {
    const [playerRows, recruitRows, teamRows] = await Promise.all([
      db.execute(sql`
        SELECT p.team_id,
               AVG(p.overall)::integer AS roster_ovr,
               AVG(CASE WHEN p.position = 'P' THEN p.overall END)::integer AS pitching_ovr,
               AVG(CASE WHEN p.position <> 'P' THEN p.overall END)::integer AS hitting_ovr
        FROM players p
        INNER JOIN teams t ON t.id = p.team_id
        WHERE t.league_id = ${leagueId}
        GROUP BY p.team_id
      `),
      db.execute(sql`
        SELECT signed_team_id AS team_id,
               AVG(overall)::integer AS recruiting_score
        FROM recruits
        WHERE league_id = ${leagueId}
          AND signed_team_id IS NOT NULL
        GROUP BY signed_team_id
      `),
      db.execute(sql`SELECT id FROM teams WHERE league_id = ${leagueId}`),
    ]);

    const playerMap = new Map<string, { roster: number; pitching: number; hitting: number }>();
    for (const row of playerRows.rows as any[]) {
      playerMap.set(row.team_id, {
        roster: row.roster_ovr ?? 0,
        pitching: row.pitching_ovr ?? 0,
        hitting: row.hitting_ovr ?? 0,
      });
    }
    const recruitMap = new Map<string, number>();
    for (const row of recruitRows.rows as any[]) {
      recruitMap.set(row.team_id, row.recruiting_score ?? 0);
    }

    const ranked = (teamRows.rows as any[]).map((t: any) => {
      const stats = playerMap.get(t.id) ?? { roster: 0, pitching: 0, hitting: 0 };
      const composite = stats.roster;
      return { teamId: t.id, composite };
    }).sort((a, b) => b.composite - a.composite);

    return ranked.map((t, i) => ({ teamId: t.teamId, rank: i + 1 }));
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

      await tx.delete(playerSeasonStats).where(eq(playerSeasonStats.leagueId, id));

      await tx.delete(playerPromises).where(eq(playerPromises.leagueId, id));

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

      // Delete storyline data before recruits/teams (FK constraints)
      await tx.delete(storylineVotes).where(
        inArray(storylineVotes.eventId,
          tx.select({ id: storylineEvents.id }).from(storylineEvents).where(eq(storylineEvents.leagueId, id))
        )
      );
      await tx.delete(storylineEvents).where(eq(storylineEvents.leagueId, id));
      await tx.delete(storylineRecruits).where(eq(storylineRecruits.leagueId, id));
      await tx.delete(walkonBids).where(eq(walkonBids.leagueId, id));
      await tx.delete(walkonPool).where(eq(walkonPool.leagueId, id));

      await tx.delete(recruits).where(eq(recruits.leagueId, id));
      await tx.delete(games).where(eq(games.leagueId, id));
      await tx.delete(standings).where(eq(standings.leagueId, id));
      await tx.delete(auditLogs).where(eq(auditLogs.leagueId, id));
      await tx.delete(leagueInvites).where(eq(leagueInvites.leagueId, id));
      await tx.delete(dynastyNews).where(eq(dynastyNews.leagueId, id));
      await tx.delete(scouts).where(eq(scouts.leagueId, id));
      await tx.delete(teams).where(eq(teams.leagueId, id));
      await tx.delete(conferences).where(eq(conferences.leagueId, id));
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

  async getPlayerSeasonStats(playerId: string, leagueId: string): Promise<PlayerSeasonStats[]> {
    return db.select().from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.leagueId, leagueId)))
      .orderBy(asc(playerSeasonStats.season));
  }

  async getPlayerSeasonStatsBySeason(leagueId: string, season: number): Promise<PlayerSeasonStats[]> {
    return db.select().from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.leagueId, leagueId), eq(playerSeasonStats.season, season)));
  }

  async getAllPlayerSeasonStatsByLeague(leagueId: string): Promise<PlayerSeasonStats[]> {
    return db.select().from(playerSeasonStats)
      .where(eq(playerSeasonStats.leagueId, leagueId));
  }

  async getLatestPlayerSeasonStatsByIds(leagueId: string, playerIds: string[]): Promise<PlayerSeasonStats[]> {
    if (playerIds.length === 0) return [];
    return db.select().from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.leagueId, leagueId), inArray(playerSeasonStats.playerId, playerIds)))
      .orderBy(desc(playerSeasonStats.season));
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

  async updatePlayerSeasonStatsPosition(playerId: string, leagueId: string, season: number, position: string): Promise<void> {
    await db.update(playerSeasonStats)
      .set({ position })
      .where(and(
        eq(playerSeasonStats.playerId, playerId),
        eq(playerSeasonStats.leagueId, leagueId),
        eq(playerSeasonStats.season, season)
      ));
  }

  async setPlayerSeasonStatsOvr(playerId: string, leagueId: string, season: number, ovr: number): Promise<void> {
    await db.update(playerSeasonStats)
      .set({ endSeasonOvr: ovr })
      .where(and(
        eq(playerSeasonStats.playerId, playerId),
        eq(playerSeasonStats.leagueId, leagueId),
        eq(playerSeasonStats.season, season)
      ));
  }

  async getSavedRostersByUser(userId: string): Promise<SavedRoster[]> {
    return await db.select().from(savedRosters).where(eq(savedRosters.userId, userId)).orderBy(desc(savedRosters.updatedAt));
  }

  async getSavedRoster(id: string): Promise<SavedRoster | undefined> {
    const [roster] = await db.select().from(savedRosters).where(eq(savedRosters.id, id));
    return roster || undefined;
  }

  async createSavedRoster(data: InsertSavedRoster): Promise<SavedRoster> {
    const [roster] = await db.insert(savedRosters).values(data).returning();
    return roster;
  }

  async updateSavedRoster(id: string, data: Partial<SavedRoster>): Promise<SavedRoster | undefined> {
    const [roster] = await db.update(savedRosters).set({ ...data, updatedAt: new Date() }).where(eq(savedRosters.id, id)).returning();
    return roster || undefined;
  }

  async deleteSavedRoster(id: string): Promise<void> {
    await db.delete(savedRosters).where(eq(savedRosters.id, id));
  }

  async getSavedRecruitingClassesByUser(userId: string): Promise<SavedRecruitingClass[]> {
    return await db.select().from(savedRecruitingClasses).where(eq(savedRecruitingClasses.userId, userId)).orderBy(desc(savedRecruitingClasses.updatedAt));
  }

  async getSavedRecruitingClass(id: string): Promise<SavedRecruitingClass | undefined> {
    const [rc] = await db.select().from(savedRecruitingClasses).where(eq(savedRecruitingClasses.id, id));
    return rc || undefined;
  }

  async createSavedRecruitingClass(data: InsertSavedRecruitingClass): Promise<SavedRecruitingClass> {
    const [rc] = await db.insert(savedRecruitingClasses).values(data).returning();
    return rc;
  }

  async updateSavedRecruitingClass(id: string, data: Partial<SavedRecruitingClass>): Promise<SavedRecruitingClass | undefined> {
    const [rc] = await db.update(savedRecruitingClasses).set({ ...data, updatedAt: new Date() }).where(eq(savedRecruitingClasses.id, id)).returning();
    return rc || undefined;
  }

  async deleteSavedRecruitingClass(id: string): Promise<void> {
    await db.delete(savedRecruitingClasses).where(eq(savedRecruitingClasses.id, id));
  }

  // ─── Recruiting Class Share Links ────────────────────────────────────────────
  async createClassShare(data: { classId: string; userId: string; token: string; label?: string }): Promise<RecruitingClassShare> {
    const [share] = await db.insert(recruitingClassShares).values({
      classId: data.classId,
      userId: data.userId,
      token: data.token,
      label: data.label ?? null,
      status: "active",
      importCount: 0,
    }).returning();
    return share;
  }

  async getClassShareByToken(token: string): Promise<RecruitingClassShare | undefined> {
    const [share] = await db.select().from(recruitingClassShares).where(eq(recruitingClassShares.token, token));
    return share || undefined;
  }

  async getClassSharesByClassId(classId: string, userId: string): Promise<RecruitingClassShare[]> {
    return db.select().from(recruitingClassShares)
      .where(and(eq(recruitingClassShares.classId, classId), eq(recruitingClassShares.userId, userId)))
      .orderBy(desc(recruitingClassShares.createdAt));
  }

  async revokeClassShare(shareId: string, userId: string): Promise<void> {
    await db.update(recruitingClassShares)
      .set({ status: "revoked" })
      .where(and(eq(recruitingClassShares.id, shareId), eq(recruitingClassShares.userId, userId)));
  }

  async incrementClassShareImportCount(shareId: string): Promise<void> {
    await db.update(recruitingClassShares)
      .set({ importCount: sql`${recruitingClassShares.importCount} + 1` })
      .where(eq(recruitingClassShares.id, shareId));
  }

  // ─── Recruiting Class Snapshots ──────────────────────────────────────────────
  async createRecruitingClassSnapshot(data: InsertRecruitingClassSnapshot): Promise<RecruitingClassSnapshot> {
    const [snap] = await db.insert(recruitingClassSnapshots).values(data).returning();
    return snap;
  }

  async getRecruitingClassSnapshotsByLeague(leagueId: string, season: number): Promise<RecruitingClassSnapshot[]> {
    return db.select().from(recruitingClassSnapshots)
      .where(and(eq(recruitingClassSnapshots.leagueId, leagueId), eq(recruitingClassSnapshots.season, season)))
      .orderBy(recruitingClassSnapshots.classRank);
  }

  async getRecruitingClassSnapshotsAllSeasons(leagueId: string): Promise<RecruitingClassSnapshot[]> {
    return db.select().from(recruitingClassSnapshots)
      .where(eq(recruitingClassSnapshots.leagueId, leagueId))
      .orderBy(recruitingClassSnapshots.season, recruitingClassSnapshots.classRank);
  }

  // ─── Storyline Recruits ──────────────────────────────────────────────────────
  async getStorylineRecruitsByLeague(leagueId: string, season?: number): Promise<StorylineRecruit[]> {
    if (season !== undefined) {
      return db.select().from(storylineRecruits)
        .where(and(eq(storylineRecruits.leagueId, leagueId), eq(storylineRecruits.season, season)))
        .orderBy(desc(storylineRecruits.createdAt));
    }
    return db.select().from(storylineRecruits)
      .where(eq(storylineRecruits.leagueId, leagueId))
      .orderBy(desc(storylineRecruits.createdAt));
  }

  async getStorylineRecruit(id: string): Promise<StorylineRecruit | undefined> {
    const [r] = await db.select().from(storylineRecruits).where(eq(storylineRecruits.id, id));
    return r || undefined;
  }

  async getStorylineRecruitByRecruitId(recruitId: string): Promise<StorylineRecruit | undefined> {
    const [r] = await db.select().from(storylineRecruits).where(eq(storylineRecruits.recruitId, recruitId));
    return r || undefined;
  }

  async createStorylineRecruit(data: InsertStorylineRecruit): Promise<StorylineRecruit> {
    const [r] = await db.insert(storylineRecruits).values(data).returning();
    return r;
  }

  async updateStorylineRecruit(id: string, data: Partial<StorylineRecruit>): Promise<StorylineRecruit | undefined> {
    const [r] = await db.update(storylineRecruits).set(data).where(eq(storylineRecruits.id, id)).returning();
    return r || undefined;
  }

  async deleteStorylineEventsByLeague(leagueId: string, season: number): Promise<void> {
    // Votes must be deleted first (no onDelete cascade on storyline_votes.eventId FK)
    // Fetch event IDs for this league/season, then delete their votes, then the events
    const events = await db.select({ id: storylineEvents.id }).from(storylineEvents)
      .where(and(eq(storylineEvents.leagueId, leagueId), eq(storylineEvents.season, season)));
    if (events.length > 0) {
      const eventIds = events.map(e => e.id);
      await db.delete(storylineVotes).where(inArray(storylineVotes.eventId, eventIds));
    }
    await db.delete(storylineEvents)
      .where(and(eq(storylineEvents.leagueId, leagueId), eq(storylineEvents.season, season)));
  }

  async deleteStorylineRecruitsByLeague(leagueId: string, season: number): Promise<void> {
    // Events/votes must be deleted before recruits to avoid FK constraint violations
    await this.deleteStorylineEventsByLeague(leagueId, season);
    await db.delete(storylineRecruits)
      .where(and(eq(storylineRecruits.leagueId, leagueId), eq(storylineRecruits.season, season)));
  }

  // ─── Storyline Events ────────────────────────────────────────────────────────
  async getStorylineEventsByLeague(leagueId: string, season?: number): Promise<StorylineEvent[]> {
    if (season !== undefined) {
      return db.select().from(storylineEvents)
        .where(and(eq(storylineEvents.leagueId, leagueId), eq(storylineEvents.season, season)))
        .orderBy(desc(storylineEvents.createdAt));
    }
    return db.select().from(storylineEvents)
      .where(eq(storylineEvents.leagueId, leagueId))
      .orderBy(desc(storylineEvents.createdAt));
  }

  async getStorylineEventsByRecruit(storylineRecruitId: string): Promise<StorylineEvent[]> {
    return db.select().from(storylineEvents)
      .where(eq(storylineEvents.storylineRecruitId, storylineRecruitId))
      .orderBy(desc(storylineEvents.createdAt));
  }

  async getUnresolvedStorylineEvents(leagueId: string, season: number): Promise<StorylineEvent[]> {
    return db.select().from(storylineEvents)
      .where(and(
        eq(storylineEvents.leagueId, leagueId),
        eq(storylineEvents.season, season),
        sql`${storylineEvents.resolvedChoice} IS NULL`,
      ))
      .orderBy(desc(storylineEvents.createdAt));
  }

  async getStorylineEvent(id: string): Promise<StorylineEvent | undefined> {
    const [e] = await db.select().from(storylineEvents).where(eq(storylineEvents.id, id));
    return e || undefined;
  }

  async createStorylineEvent(data: InsertStorylineEvent): Promise<StorylineEvent> {
    const [e] = await db.insert(storylineEvents).values(data).returning();
    return e;
  }

  async updateStorylineEvent(id: string, data: Partial<StorylineEvent>): Promise<StorylineEvent | undefined> {
    const [e] = await db.update(storylineEvents).set(data).where(eq(storylineEvents.id, id)).returning();
    return e || undefined;
  }

  async getFirstStorylineEventImageByTemplateId(templateId: string): Promise<string | null> {
    const [e] = await db.select({ eventImageUrl: storylineEvents.eventImageUrl })
      .from(storylineEvents)
      .where(and(eq(storylineEvents.templateId, templateId), isNotNull(storylineEvents.eventImageUrl)))
      .limit(1);
    return e?.eventImageUrl ?? null;
  }

  async getStorylineEventsWithMissingImages(): Promise<StorylineEvent[]> {
    return db.select().from(storylineEvents)
      .where(and(isNotNull(storylineEvents.templateId), isNull(storylineEvents.eventImageUrl)));
  }

  async updateStorylineEventImageByTemplateId(templateId: string, imageUrl: string): Promise<void> {
    await db.update(storylineEvents)
      .set({ eventImageUrl: imageUrl })
      .where(and(eq(storylineEvents.templateId, templateId), isNull(storylineEvents.eventImageUrl)));
  }

  async setStorylineEventImageByLeagueAndTemplate(leagueId: string, templateId: string, imageUrl: string): Promise<void> {
    await db.update(storylineEvents)
      .set({ eventImageUrl: imageUrl })
      .where(and(eq(storylineEvents.leagueId, leagueId), eq(storylineEvents.templateId, templateId)));
  }

  // ─── Game Reports ─────────────────────────────────────────────────────────────
  async getGameReport(gameId: string): Promise<GameReport | undefined> {
    const [r] = await db.select().from(gameReports).where(eq(gameReports.gameId, gameId));
    return r || undefined;
  }

  async getGameReportsByLeague(leagueId: string): Promise<GameReport[]> {
    return db.select().from(gameReports).where(eq(gameReports.leagueId, leagueId)).orderBy(desc(gameReports.createdAt));
  }

  async getDisputedReports(leagueId: string): Promise<GameReport[]> {
    const all = await this.getGameReportsByLeague(leagueId);
    return all.filter(r => r.status === "disputed");
  }

  async getPendingReportsForTeam(leagueId: string, teamId: string): Promise<GameReport[]> {
    // Returns pending reports where `teamId` is the opposing team that needs to confirm.
    // Requires a game-data join to verify teamId is actually in the matchup.
    // Case 1: reporter is identified (reporterTeamId set) → teamId must be the other team in the game.
    // Case 2: commissioner reported (reporterTeamId null) → teamId must be one of the two game teams.
    const [pendingReports, leagueGames] = await Promise.all([
      this.getGameReportsByLeague(leagueId).then(rs => rs.filter(r => r.status === "pending")),
      db.select().from(games).where(eq(games.leagueId, leagueId)),
    ]);
    const gameById = new Map(leagueGames.map(g => [g.id, g]));
    return pendingReports.filter(r => {
      const game = gameById.get(r.gameId);
      if (!game) return false;
      const isInMatchup = game.homeTeamId === teamId || game.awayTeamId === teamId;
      if (!isInMatchup) return false;
      if (r.reporterTeamId === null) return true; // commissioner submitted — any involved coach can confirm
      return r.reporterTeamId !== teamId; // team is the opponent, not the submitter
    });
  }

  async createGameReport(data: InsertGameReport): Promise<GameReport> {
    const [r] = await db.insert(gameReports).values(data).returning();
    return r;
  }

  async updateGameReport(id: string, data: Partial<GameReport>): Promise<GameReport | undefined> {
    const [r] = await db.update(gameReports).set({ ...data, updatedAt: new Date() }).where(eq(gameReports.id, id)).returning();
    return r || undefined;
  }

  // ─── Storyline Votes ─────────────────────────────────────────────────────────
  async getStorylineVotesByEvent(eventId: string): Promise<StorylineVote[]> {
    return db.select().from(storylineVotes).where(eq(storylineVotes.eventId, eventId));
  }

  async getStorylineVoteByTeam(eventId: string, teamId: string): Promise<StorylineVote | undefined> {
    const [v] = await db.select().from(storylineVotes)
      .where(and(eq(storylineVotes.eventId, eventId), eq(storylineVotes.teamId, teamId)));
    return v || undefined;
  }

  async createStorylineVote(data: InsertStorylineVote): Promise<StorylineVote> {
    const [v] = await db.insert(storylineVotes).values(data).returning();
    return v;
  }

  async updateStorylineVote(id: string, data: Partial<StorylineVote>): Promise<StorylineVote | undefined> {
    const [v] = await db.update(storylineVotes).set(data).where(eq(storylineVotes.id, id)).returning();
    return v || undefined;
  }

  // ─── NIL Season Earnings ─────────────────────────────────────────────────────
  async createNilSeasonEarning(data: InsertNilSeasonEarning): Promise<NilSeasonEarning> {
    const [row] = await db.insert(nilSeasonEarnings).values(data).onConflictDoNothing().returning();
    if (!row) {
      const [existing] = await db.select().from(nilSeasonEarnings).where(
        and(
          eq(nilSeasonEarnings.leagueId, data.leagueId),
          eq(nilSeasonEarnings.teamId, data.teamId),
          eq(nilSeasonEarnings.season, data.season),
          eq(nilSeasonEarnings.category, data.category),
        )
      );
      return existing;
    }
    return row;
  }

  async getNilEarningsByTeam(leagueId: string, teamId: string, season: number): Promise<NilSeasonEarning[]> {
    return db.select().from(nilSeasonEarnings).where(
      and(
        eq(nilSeasonEarnings.leagueId, leagueId),
        eq(nilSeasonEarnings.teamId, teamId),
        eq(nilSeasonEarnings.season, season),
      )
    ).orderBy(nilSeasonEarnings.createdAt);
  }

  async getNilEarningsByLeague(leagueId: string, season: number): Promise<NilSeasonEarning[]> {
    return db.select().from(nilSeasonEarnings).where(
      and(
        eq(nilSeasonEarnings.leagueId, leagueId),
        eq(nilSeasonEarnings.season, season),
      )
    ).orderBy(nilSeasonEarnings.teamId, nilSeasonEarnings.createdAt);
  }

  async hasNilEarningCategory(leagueId: string, teamId: string, category: string): Promise<boolean> {
    const [row] = await db.select({ id: nilSeasonEarnings.id }).from(nilSeasonEarnings).where(
      and(
        eq(nilSeasonEarnings.leagueId, leagueId),
        eq(nilSeasonEarnings.teamId, teamId),
        eq(nilSeasonEarnings.category, category),
      )
    ).limit(1);
    return !!row;
  }
}

export const storage = new DatabaseStorage();
