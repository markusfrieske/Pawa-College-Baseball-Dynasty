import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  password: true,
}).extend({
  id: z.string().optional(), // Allow optional id for guest user creation
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Leagues table
export const leagues = pgTable("leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  commissionerId: varchar("commissioner_id").notNull().references(() => users.id),
  maxTeams: integer("max_teams").notNull().default(16),
  cpuDifficulty: text("cpu_difficulty").notNull().default("normal"),
  seasonLength: text("season_length").notNull().default("medium"),
  currentSeason: integer("current_season").notNull().default(1),
  currentPhase: text("current_phase").notNull().default("preseason"),
  currentWeek: integer("current_week").notNull().default(1),
  auditLogPublic: boolean("audit_log_public").notNull().default(true),
});

export const insertLeagueSchema = createInsertSchema(leagues).pick({
  name: true,
  commissionerId: true,
  maxTeams: true,
  cpuDifficulty: true,
  seasonLength: true,
  currentPhase: true,
});

export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type League = typeof leagues.$inferSelect;

// Conferences table
export const conferences = pgTable("conferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  name: text("name").notNull(),
});

export const insertConferenceSchema = createInsertSchema(conferences).pick({
  leagueId: true,
  name: true,
});

export type InsertConference = z.infer<typeof insertConferenceSchema>;
export type Conference = typeof conferences.$inferSelect;

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  conferenceId: varchar("conference_id").references(() => conferences.id),
  coachId: varchar("coach_id"),
  name: text("name").notNull(),
  mascot: text("mascot").notNull(),
  abbreviation: text("abbreviation").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipcode: text("zipcode"),
  primaryColor: text("primary_color").notNull().default("#0037ff"),
  secondaryColor: text("secondary_color").notNull().default("#FFD700"),
  prestige: integer("prestige").notNull().default(5),
  stadium: integer("stadium").notNull().default(5),
  facilities: integer("facilities").notNull().default(5),
  collegeLife: integer("college_life").notNull().default(5),
  marketing: integer("marketing").notNull().default(5),
  academics: integer("academics").notNull().default(5),
  fanbasePassion: text("fanbase_passion").notNull().default("B"),
  fanbaseType: text("fanbase_type").notNull().default("Balanced"),
  enrollment: integer("enrollment").notNull().default(30000),
  nilBudget: integer("nil_budget").notNull().default(3000000),
  isCpu: boolean("is_cpu").notNull().default(true),
});

export const insertTeamSchema = createInsertSchema(teams).pick({
  leagueId: true,
  conferenceId: true,
  name: true,
  mascot: true,
  abbreviation: true,
  city: true,
  state: true,
  zipcode: true,
  primaryColor: true,
  secondaryColor: true,
  prestige: true,
  stadium: true,
  facilities: true,
  collegeLife: true,
  marketing: true,
  academics: true,
  fanbasePassion: true,
  fanbaseType: true,
  enrollment: true,
  nilBudget: true,
  isCpu: true,
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Coaches table
export const coaches = pgTable("coaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  teamId: varchar("team_id").references(() => teams.id),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  archetype: text("archetype").notNull().default("Balanced"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  scoutingSkill: integer("scouting_skill").notNull().default(1),
  evaluationSkill: integer("evaluation_skill").notNull().default(1),
  pitchingRecruitingSkill: integer("pitching_recruiting_skill").notNull().default(1),
  hittingRecruitingSkill: integer("hitting_recruiting_skill").notNull().default(1),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  facialHair: text("facial_hair").notNull().default("none"),
  eyeStyle: text("eye_style").notNull().default("normal"),
  skillTreeChoices: json("skill_tree_choices").$type<string[]>().default([]),
  // Career stats
  careerWins: integer("career_wins").notNull().default(0),
  careerLosses: integer("career_losses").notNull().default(0),
  confWins: integer("conf_wins").notNull().default(0),
  confLosses: integer("conf_losses").notNull().default(0),
  confChampionships: integer("conf_championships").notNull().default(0),
  cwsAppearances: integer("cws_appearances").notNull().default(0),
  nationalChampionships: integer("national_championships").notNull().default(0),
  coachOfYearAwards: integer("coach_of_year_awards").notNull().default(0),
  allAmericans: integer("all_americans").notNull().default(0),
  draftPicks: integer("draft_picks").notNull().default(0),
  legacyScore: integer("legacy_score").notNull().default(0),
  skillPoints: integer("skill_points").notNull().default(0),
  isReady: boolean("is_ready").notNull().default(false),
  scoutActionsUsed: integer("scout_actions_used").notNull().default(0),
  recruitActionsUsed: integer("recruit_actions_used").notNull().default(0),
});

export const insertCoachSchema = createInsertSchema(coaches).pick({
  userId: true,
  teamId: true,
  leagueId: true,
  firstName: true,
  lastName: true,
  archetype: true,
  scoutingSkill: true,
  evaluationSkill: true,
  pitchingRecruitingSkill: true,
  hittingRecruitingSkill: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  facialHair: true,
  eyeStyle: true,
});

export type InsertCoach = z.infer<typeof insertCoachSchema>;
export type Coach = typeof coaches.$inferSelect;

// Scouts table
export const scouts = pgTable("scouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  name: text("name").notNull(),
  perks: json("perks").$type<string[]>().default([]),
  downsides: json("downsides").$type<string[]>().default([]),
  contractYearsRemaining: integer("contract_years_remaining").notNull().default(3),
  isFreeAgent: boolean("is_free_agent").notNull().default(true),
});

export const insertScoutSchema = createInsertSchema(scouts).pick({
  teamId: true,
  leagueId: true,
  name: true,
  perks: true,
  downsides: true,
  contractYearsRemaining: true,
  isFreeAgent: true,
});

export type InsertScout = z.infer<typeof insertScoutSchema>;
export type Scout = typeof scouts.$inferSelect;

// Players table (roster players)
export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position").notNull(),
  eligibility: text("eligibility").notNull().default("FR"),
  throwHand: text("throw_hand").notNull().default("R"),
  batHand: text("bat_hand").notNull().default("R"),
  homeState: text("home_state").notNull(),
  hometown: text("hometown").notNull(),
  jerseyNumber: integer("jersey_number").notNull(),
  overall: integer("overall").notNull().default(500),
  starRating: integer("star_rating").notNull().default(3),
  // Fielder attributes (letter grades S-G, stored as 0-100)
  hitForAvg: integer("hit_for_avg").default(50),
  power: integer("power").default(50),
  speed: integer("speed").default(50),
  arm: integer("arm").default(50),
  fielding: integer("fielding").default(50),
  errorResistance: integer("error_resistance").default(50),
  clutch: integer("clutch").default(50),
  vsLHP: integer("vs_lhp").default(50),
  grit: integer("grit").default(50),
  stealing: integer("stealing").default(50),
  running: integer("running").default(50),
  throwing: integer("throwing").default(50),
  recovery: integer("recovery").default(50),
  catcherAbility: integer("catcher_ability").default(50),
  // Pitcher attributes (letter grades S-G, stored as 0-100)
  velocity: integer("velocity").default(50),
  control: integer("control").default(50),
  stamina: integer("stamina").default(50),
  stuff: integer("stuff").default(50),
  wRISP: integer("w_risp").default(50),
  vsLefty: integer("vs_lefty").default(50),
  poise: integer("poise").default(50),
  heater: integer("heater").default(50),
  agile: integer("agile").default(50),
  abilities: json("abilities").$type<string[]>().default([]),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  headwear: text("headwear").notNull().default("cap"),
});

export const insertPlayerSchema = createInsertSchema(players).pick({
  teamId: true,
  firstName: true,
  lastName: true,
  position: true,
  eligibility: true,
  throwHand: true,
  batHand: true,
  homeState: true,
  hometown: true,
  jerseyNumber: true,
  overall: true,
  starRating: true,
  hitForAvg: true,
  power: true,
  speed: true,
  arm: true,
  fielding: true,
  errorResistance: true,
  clutch: true,
  vsLHP: true,
  grit: true,
  stealing: true,
  running: true,
  throwing: true,
  recovery: true,
  catcherAbility: true,
  velocity: true,
  control: true,
  stamina: true,
  stuff: true,
  wRISP: true,
  vsLefty: true,
  poise: true,
  heater: true,
  agile: true,
  abilities: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  headwear: true,
});

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// Recruits table
export const recruits = pgTable("recruits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position").notNull(),
  throwHand: text("throw_hand").notNull().default("R"),
  batHand: text("bat_hand").notNull().default("R"),
  homeState: text("home_state").notNull(),
  hometown: text("hometown").notNull(),
  starRank: integer("star_rank").notNull().default(3),
  classRank: integer("class_rank").notNull(),
  positionRank: integer("position_rank").notNull(),
  recruitType: text("recruit_type").notNull().default("HS"),
  overall: integer("overall").notNull().default(500),
  starRating: integer("star_rating").notNull().default(3),
  // Fielder attributes (letter grades S-G, stored as 0-100)
  hitForAvg: integer("hit_for_avg").default(50),
  power: integer("power").default(50),
  speed: integer("speed").default(50),
  arm: integer("arm").default(50),
  fielding: integer("fielding").default(50),
  errorResistance: integer("error_resistance").default(50),
  clutch: integer("clutch").default(50),
  vsLHP: integer("vs_lhp").default(50),
  grit: integer("grit").default(50),
  stealing: integer("stealing").default(50),
  running: integer("running").default(50),
  throwing: integer("throwing").default(50),
  recovery: integer("recovery").default(50),
  catcherAbility: integer("catcher_ability").default(50),
  // Pitcher attributes (letter grades S-G, stored as 0-100)
  velocity: integer("velocity").default(50),
  control: integer("control").default(50),
  stamina: integer("stamina").default(50),
  stuff: integer("stuff").default(50),
  wRISP: integer("w_risp").default(50),
  vsLefty: integer("vs_lefty").default(50),
  poise: integer("poise").default(50),
  heater: integer("heater").default(50),
  agile: integer("agile").default(50),
  abilities: json("abilities").$type<string[]>().default([]),
  proximityPriority: text("proximity_priority").notNull().default("Somewhat"),
  reputationPriority: text("reputation_priority").notNull().default("Somewhat"),
  playingTimePriority: text("playing_time_priority").notNull().default("Somewhat"),
  academicsPriority: text("academics_priority").notNull().default("Somewhat"),
  prestigePriority: text("prestige_priority").notNull().default("Somewhat"),
  facilitiesPriority: text("facilities_priority").notNull().default("Somewhat"),
  dealbreaker: text("dealbreaker"),
  commitmentThreshold: integer("commitment_threshold").notNull().default(500),
  stage: text("stage").notNull().default("open"),
  signedTeamId: varchar("signed_team_id").references(() => teams.id),
  isBlueChip: boolean("is_blue_chip").notNull().default(false),
  isGem: boolean("is_gem").notNull().default(false),
  isBust: boolean("is_bust").notNull().default(false),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  headwear: text("headwear").notNull().default("cap"),
});

export const insertRecruitSchema = createInsertSchema(recruits).pick({
  leagueId: true,
  firstName: true,
  lastName: true,
  position: true,
  throwHand: true,
  batHand: true,
  homeState: true,
  hometown: true,
  starRank: true,
  classRank: true,
  positionRank: true,
  recruitType: true,
  overall: true,
  starRating: true,
  hitForAvg: true,
  power: true,
  speed: true,
  arm: true,
  fielding: true,
  errorResistance: true,
  clutch: true,
  vsLHP: true,
  grit: true,
  stealing: true,
  running: true,
  throwing: true,
  recovery: true,
  catcherAbility: true,
  velocity: true,
  control: true,
  stamina: true,
  stuff: true,
  wRISP: true,
  vsLefty: true,
  poise: true,
  heater: true,
  agile: true,
  abilities: true,
  proximityPriority: true,
  reputationPriority: true,
  playingTimePriority: true,
  academicsPriority: true,
  prestigePriority: true,
  facilitiesPriority: true,
  dealbreaker: true,
  commitmentThreshold: true,
  stage: true,
  signedTeamId: true,
  isBlueChip: true,
  isGem: true,
  isBust: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  headwear: true,
});

export type InsertRecruit = z.infer<typeof insertRecruitSchema>;
export type Recruit = typeof recruits.$inferSelect;

// Recruiting interest (team interest in recruit)
export const recruitingInterests = pgTable("recruiting_interests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recruitId: varchar("recruit_id").notNull().references(() => recruits.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  interestLevel: integer("interest_level").notNull().default(0),
  scoutPercentage: integer("scout_percentage").notNull().default(0),
  isTargeted: boolean("is_targeted").notNull().default(false),
  hasOffer: boolean("has_offer").notNull().default(false),
  revealedAttributes: json("revealed_attributes").$type<string[]>().default([]),
  minOverall: integer("min_overall").notNull().default(1),
  maxOverall: integer("max_overall").notNull().default(999),
  minStar: integer("min_star").notNull().default(1),
  maxStar: integer("max_star").notNull().default(5),
  revealedAbilitiesCount: integer("revealed_abilities_count").notNull().default(0),
  notes: text("notes"),
});

export const insertRecruitingInterestSchema = createInsertSchema(recruitingInterests).pick({
  recruitId: true,
  teamId: true,
  interestLevel: true,
  scoutPercentage: true,
  isTargeted: true,
  hasOffer: true,
  revealedAttributes: true,
  minOverall: true,
  maxOverall: true,
  minStar: true,
  maxStar: true,
  revealedAbilitiesCount: true,
  notes: true,
});

export type InsertRecruitingInterest = z.infer<typeof insertRecruitingInterestSchema>;
export type RecruitingInterest = typeof recruitingInterests.$inferSelect;

// Games table
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  homeTeamId: varchar("home_team_id").notNull().references(() => teams.id),
  awayTeamId: varchar("away_team_id").notNull().references(() => teams.id),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isComplete: boolean("is_complete").notNull().default(false),
  phase: text("phase").notNull().default("regular"),
});

export const insertGameSchema = createInsertSchema(games).pick({
  leagueId: true,
  season: true,
  week: true,
  homeTeamId: true,
  awayTeamId: true,
  homeScore: true,
  awayScore: true,
  isComplete: true,
  phase: true,
});

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// Standings table
export const standings = pgTable("standings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  season: integer("season").notNull(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  conferenceWins: integer("conference_wins").notNull().default(0),
  conferenceLosses: integer("conference_losses").notNull().default(0),
  runsScored: integer("runs_scored").notNull().default(0),
  runsAllowed: integer("runs_allowed").notNull().default(0),
});

export const insertStandingsSchema = createInsertSchema(standings).pick({
  leagueId: true,
  teamId: true,
  season: true,
  wins: true,
  losses: true,
  conferenceWins: true,
  conferenceLosses: true,
  runsScored: true,
  runsAllowed: true,
});

export type InsertStandings = z.infer<typeof insertStandingsSchema>;
export type Standings = typeof standings.$inferSelect;

// Audit log table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  details: text("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  leagueId: true,
  userId: true,
  action: true,
  details: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// League invites table for email invitations
export const leagueInvites = pgTable("league_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  email: text("email").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending, accepted, expired
  teamId: varchar("team_id").references(() => teams.id), // team selected by invitee
  invitedById: varchar("invited_by_id").notNull().references(() => users.id),
  acceptedById: varchar("accepted_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const insertLeagueInviteSchema = createInsertSchema(leagueInvites).pick({
  leagueId: true,
  email: true,
  inviteCode: true,
  invitedById: true,
  expiresAt: true,
});

export type InsertLeagueInvite = z.infer<typeof insertLeagueInviteSchema>;
export type LeagueInvite = typeof leagueInvites.$inferSelect;

// Dynasty News table
export const dynastyNews = pgTable("dynasty_news", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"), // general, recruiting, game, trade, announcement
  imageUrl: text("image_url"),
  isSticky: boolean("is_sticky").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDynastyNewsSchema = createInsertSchema(dynastyNews).pick({
  leagueId: true,
  authorId: true,
  authorName: true,
  title: true,
  content: true,
  category: true,
  imageUrl: true,
  isSticky: true,
});

export type InsertDynastyNews = z.infer<typeof insertDynastyNewsSchema>;
export type DynastyNews = typeof dynastyNews.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  leagues: many(leagues),
  coaches: many(coaches),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  commissioner: one(users, { fields: [leagues.commissionerId], references: [users.id] }),
  conferences: many(conferences),
  teams: many(teams),
  recruits: many(recruits),
  games: many(games),
  auditLogs: many(auditLogs),
}));

export const conferencesRelations = relations(conferences, ({ one, many }) => ({
  league: one(leagues, { fields: [conferences.leagueId], references: [leagues.id] }),
  teams: many(teams),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, { fields: [teams.leagueId], references: [leagues.id] }),
  conference: one(conferences, { fields: [teams.conferenceId], references: [conferences.id] }),
  players: many(players),
  recruitingInterests: many(recruitingInterests),
  homeGames: many(games),
}));

export const coachesRelations = relations(coaches, ({ one }) => ({
  user: one(users, { fields: [coaches.userId], references: [users.id] }),
  team: one(teams, { fields: [coaches.teamId], references: [teams.id] }),
  league: one(leagues, { fields: [coaches.leagueId], references: [leagues.id] }),
}));

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] }),
}));

export const recruitsRelations = relations(recruits, ({ one, many }) => ({
  league: one(leagues, { fields: [recruits.leagueId], references: [leagues.id] }),
  interests: many(recruitingInterests),
  signedTeam: one(teams, { fields: [recruits.signedTeamId], references: [teams.id] }),
}));

export const recruitingInterestsRelations = relations(recruitingInterests, ({ one }) => ({
  recruit: one(recruits, { fields: [recruitingInterests.recruitId], references: [recruits.id] }),
  team: one(teams, { fields: [recruitingInterests.teamId], references: [teams.id] }),
}));

export const gamesRelations = relations(games, ({ one }) => ({
  league: one(leagues, { fields: [games.leagueId], references: [leagues.id] }),
  homeTeam: one(teams, { fields: [games.homeTeamId], references: [teams.id] }),
  awayTeam: one(teams, { fields: [games.awayTeamId], references: [teams.id] }),
}));

export const standingsRelations = relations(standings, ({ one }) => ({
  league: one(leagues, { fields: [standings.leagueId], references: [leagues.id] }),
  team: one(teams, { fields: [standings.teamId], references: [teams.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  league: one(leagues, { fields: [auditLogs.leagueId], references: [leagues.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const leagueInvitesRelations = relations(leagueInvites, ({ one }) => ({
  league: one(leagues, { fields: [leagueInvites.leagueId], references: [leagues.id] }),
  team: one(teams, { fields: [leagueInvites.teamId], references: [teams.id] }),
  invitedBy: one(users, { fields: [leagueInvites.invitedById], references: [users.id] }),
  acceptedBy: one(users, { fields: [leagueInvites.acceptedById], references: [users.id] }),
}));

export const dynastyNewsRelations = relations(dynastyNews, ({ one }) => ({
  league: one(leagues, { fields: [dynastyNews.leagueId], references: [leagues.id] }),
  author: one(users, { fields: [dynastyNews.authorId], references: [users.id] }),
}));
