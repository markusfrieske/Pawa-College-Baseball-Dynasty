import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, json, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
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
  cpuDifficulty: text("cpu_difficulty").notNull().default("high_school"),
  seasonLength: text("season_length").notNull().default("medium"),
  currentSeason: integer("current_season").notNull().default(1),
  currentPhase: text("current_phase").notNull().default("preseason"),
  currentWeek: integer("current_week").notNull().default(1),
  auditLogPublic: boolean("audit_log_public").notNull().default(true),
  progressionEnabled: boolean("progression_enabled").notNull().default(false),
  phaseDeadline: timestamp("phase_deadline"),
  prevPowerRankings: json("prev_power_rankings"),
  cpuRecruitingAggression: integer("cpu_recruiting_aggression").notNull().default(3),
  coCommissionerIds: json("co_commissioner_ids").$type<string[]>().default([]),
  emailDigestsEnabled: boolean("email_digests_enabled").notNull().default(true),
  lastWalkonAuction: text("last_walkon_auction"),
});

export const insertLeagueSchema = createInsertSchema(leagues).pick({
  name: true,
  commissionerId: true,
  maxTeams: true,
  cpuDifficulty: true,
  seasonLength: true,
  currentPhase: true,
  progressionEnabled: true,
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
  nilSpent: integer("nil_spent").notNull().default(0),
  isCpu: boolean("is_cpu").notNull().default(true),
  departuresFinalized: boolean("departures_finalized").notNull().default(false),
  walkonReady: boolean("walkon_ready").notNull().default(false),
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
  nilSpent: true,
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
  careerRecruitingScore: real("career_recruiting_score"),
  skillPoints: integer("skill_points").notNull().default(0),
  isReady: boolean("is_ready").notNull().default(false),
  scoutActionsUsed: integer("scout_actions_used").notNull().default(0),
  recruitActionsUsed: integer("recruit_actions_used").notNull().default(0),
  // Personality & philosophy
  personality: text("personality"),
  coachingPhilosophy: json("coaching_philosophy").$type<{statement: string; importance: string}[]>().default([]),
  traitBadges: json("trait_badges").$type<string[]>().default([]),
  careerMilestones: json("career_milestones").$type<{id: string; season: number}[]>().default([]),
}, (t) => [
  index("idx_coaches_team_id").on(t.teamId),
  index("idx_coaches_league_id").on(t.leagueId),
]);

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
  overall: integer("overall").notNull().default(300),
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
  // Pitch mix (pitchers only) - FB/2S are binary (0 or 1), others are 0-7
  pitchFB: integer("pitch_fb").default(1),
  pitch2S: integer("pitch_2s").default(0),
  pitchSL: integer("pitch_sl").default(0),
  pitchCB: integer("pitch_cb").default(0),
  pitchCH: integer("pitch_ch").default(0),
  pitchCT: integer("pitch_ct").default(0),
  pitchSNK: integer("pitch_snk").default(0),
  pitchSPL: integer("pitch_spl").default(0),
  pitchSHU: integer("pitch_shu").default(0),
  pitchCCH: integer("pitch_cch").default(0),
  pitchHSL: integer("pitch_hsl").default(0),
  pitchSWP: integer("pitch_swp").default(0),
  pitchKN: integer("pitch_kn").default(0),
  pitchVSL: integer("pitch_vsl").default(0),
  pitchSFF: integer("pitch_sff").default(0),
  pitchFK: integer("pitch_fk").default(0),
  pitchSCB: integer("pitch_scb").default(0),
  pitchPCB: integer("pitch_pcb").default(0),
  abilities: json("abilities").$type<string[]>().default([]),
  declaredForDraft: boolean("declared_for_draft").notNull().default(false),
  draftDeclarationDate: timestamp("draft_declaration_date"),
  inTransferPortal: boolean("in_transfer_portal").notNull().default(false),
  portalEntryDate: timestamp("portal_entry_date"),
  portalReason: text("portal_reason"),
  pendingDeparture: boolean("pending_departure").notNull().default(false),
  departureType: text("departure_type"),
  retentionStatus: text("retention_status"),
  draftAskMin: integer("draft_ask_min"),
  draftAskMax: integer("draft_ask_max"),
  draftRound: integer("draft_round"),
  nilOffered: integer("nil_offered"),
  signingOvr: integer("signing_ovr"),
  transferReason: text("transfer_reason"),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  facialHair: text("facial_hair").notNull().default("none"),
  eyeStyle: text("eye_style").notNull().default("standard"),
  eyebrowStyle: text("eyebrow_style").notNull().default("flat"),
  mouthStyle: text("mouth_style").notNull().default("neutral"),
  eyeBlack: boolean("eye_black").notNull().default(false),
  headwear: text("headwear").notNull().default("cap"),
  potential: integer("potential"),
  depthOrder: integer("depth_order").notNull().default(0),
  battingOrder: integer("batting_order"),
  pitchingRole: text("pitching_role"),
  lineupPosition: text("lineup_position"),
  originalPosition: text("original_position"),
  progressionDeltas: json("progression_deltas").$type<Record<string, number>>(),
  tools: json("tools").$type<string[]>().default([]),
  workEthicScore: integer("work_ethic_score").notNull().default(70),
  coachability: integer("coachability").notNull().default(70),
}, (t) => [
  index("idx_players_team_id").on(t.teamId),
]);

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
  pitchFB: true,
  pitch2S: true,
  pitchSL: true,
  pitchCB: true,
  pitchCH: true,
  pitchCT: true,
  pitchSNK: true,
  pitchSPL: true,
  pitchSHU: true,
  pitchCCH: true,
  pitchHSL: true,
  pitchSWP: true,
  pitchKN: true,
  pitchVSL: true,
  pitchSFF: true,
  pitchFK: true,
  pitchSCB: true,
  pitchPCB: true,
  abilities: true,
  declaredForDraft: true,
  draftDeclarationDate: true,
  inTransferPortal: true,
  portalEntryDate: true,
  portalReason: true,
  pendingDeparture: true,
  departureType: true,
  retentionStatus: true,
  draftAskMin: true,
  draftAskMax: true,
  draftRound: true,
  nilOffered: true,
  transferReason: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  facialHair: true,
  eyeStyle: true,
  eyebrowStyle: true,
  mouthStyle: true,
  eyeBlack: true,
  headwear: true,
  potential: true,
  depthOrder: true,
  battingOrder: true,
  pitchingRole: true,
  lineupPosition: true,
  tools: true,
}).extend({
  pitchCH: z.union([z.literal(0), z.literal(1)]).optional(),
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
  recruitYear: text("recruit_year").notNull().default("FR"),
  overall: integer("overall").notNull().default(300),
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
  // Pitch mix (pitchers only) - FB/2S are binary (0 or 1), others are 0-7
  pitchFB: integer("pitch_fb").default(1),
  pitch2S: integer("pitch_2s").default(0),
  pitchSL: integer("pitch_sl").default(0),
  pitchCB: integer("pitch_cb").default(0),
  pitchCH: integer("pitch_ch").default(0),
  pitchCT: integer("pitch_ct").default(0),
  pitchSNK: integer("pitch_snk").default(0),
  pitchSPL: integer("pitch_spl").default(0),
  pitchSHU: integer("pitch_shu").default(0),
  pitchCCH: integer("pitch_cch").default(0),
  pitchHSL: integer("pitch_hsl").default(0),
  pitchSWP: integer("pitch_swp").default(0),
  pitchKN: integer("pitch_kn").default(0),
  pitchVSL: integer("pitch_vsl").default(0),
  pitchSFF: integer("pitch_sff").default(0),
  pitchFK: integer("pitch_fk").default(0),
  pitchSCB: integer("pitch_scb").default(0),
  pitchPCB: integer("pitch_pcb").default(0),
  abilities: json("abilities").$type<string[]>().default([]),
  // Randomized scouting reveal order - JSON array of field names that determines unlock order
  scoutingOrder: json("scouting_order").$type<string[]>().default([]),
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
  isGenerationalGem: boolean("is_generational_gem").notNull().default(false),
  isGenerationalBust: boolean("is_generational_bust").notNull().default(false),
  storyLockedAbilities: json("story_locked_abilities").$type<string[]>().default([]),
  personality: text("personality"), // 'leader', 'hot_head', 'coachable', 'lazy', 'clutch_gene', 'team_player', 'lone_wolf', 'grinder'
  workEthic: text("work_ethic"), // 'elite', 'high', 'average', 'low'
  gemBustRevealed: boolean("gem_bust_revealed").notNull().default(false),
  sourcePlayerId: varchar("source_player_id"),
  fromTeamName: text("from_team_name"),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  facialHair: text("facial_hair").notNull().default("none"),
  eyeStyle: text("eye_style").notNull().default("standard"),
  eyebrowStyle: text("eyebrow_style").notNull().default("flat"),
  mouthStyle: text("mouth_style").notNull().default("neutral"),
  eyeBlack: boolean("eye_black").notNull().default(false),
  headwear: text("headwear").notNull().default("cap"),
  potential: integer("potential"),
  potentialFloor: integer("potential_floor"),
  potentialCeiling: integer("potential_ceiling"),
  tools: json("tools").$type<string[]>().default([]),
  playerArchetype: text("player_archetype").notNull().default("normal"),
  workEthicScore: integer("work_ethic_score").notNull().default(70),
  coachability: integer("coachability").notNull().default(70),
  classVintage: text("class_vintage"),
  // Set to true after finalizeSigningDay runs — unlocks all attributes for the signing day reveal screen
  signingDayRevealed: boolean("signing_day_revealed").notNull().default(false),
}, (t) => [
  index("idx_recruits_league_id").on(t.leagueId),
]);

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
  recruitYear: true,
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
  pitchFB: true,
  pitch2S: true,
  pitchSL: true,
  pitchCB: true,
  pitchCH: true,
  pitchCT: true,
  pitchSNK: true,
  pitchSPL: true,
  pitchSHU: true,
  pitchCCH: true,
  pitchHSL: true,
  pitchSWP: true,
  pitchKN: true,
  pitchVSL: true,
  pitchSFF: true,
  pitchFK: true,
  pitchSCB: true,
  pitchPCB: true,
  abilities: true,
  scoutingOrder: true,
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
  isGenerationalGem: true,
  isGenerationalBust: true,
  storyLockedAbilities: true,
  personality: true,
  workEthic: true,
  gemBustRevealed: true,
  sourcePlayerId: true,
  fromTeamName: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  facialHair: true,
  eyeStyle: true,
  eyebrowStyle: true,
  mouthStyle: true,
  eyeBlack: true,
  headwear: true,
  potential: true,
  potentialFloor: true,
  potentialCeiling: true,
  tools: true,
  playerArchetype: true,
  workEthicScore: true,
  coachability: true,
  classVintage: true,
}).extend({
  pitchCH: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type InsertRecruit = z.infer<typeof insertRecruitSchema>;
export type Recruit = typeof recruits.$inferSelect;

export const walkonPool = pgTable("walkon_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position").notNull(),
  throwHand: text("throw_hand").notNull().default("R"),
  batHand: text("bat_hand").notNull().default("R"),
  homeState: text("home_state").notNull(),
  hometown: text("hometown").notNull(),
  eligibility: text("eligibility").notNull().default("FR"),
  overall: integer("overall").notNull().default(200),
  starRating: integer("star_rating").notNull().default(1),
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
  potential: integer("potential"),
  signedTeamId: varchar("signed_team_id").references(() => teams.id),
  signedTeamName: text("signed_team_name"),
  isGenerated: boolean("is_generated").notNull().default(false),
  sourceRecruitId: varchar("source_recruit_id"),
  skinTone: text("skin_tone").notNull().default("light"),
  hairColor: text("hair_color").notNull().default("brown"),
  hairStyle: text("hair_style").notNull().default("short"),
  headwear: text("headwear").notNull().default("cap"),
  awardedTeamId: varchar("awarded_team_id"),
  awardedTeamName: text("awarded_team_name"),
  awardedPrice: integer("awarded_price"),
});

export const insertWalkonSchema = createInsertSchema(walkonPool).pick({
  leagueId: true,
  firstName: true,
  lastName: true,
  position: true,
  throwHand: true,
  batHand: true,
  homeState: true,
  hometown: true,
  eligibility: true,
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
  potential: true,
  signedTeamId: true,
  signedTeamName: true,
  isGenerated: true,
  sourceRecruitId: true,
  skinTone: true,
  hairColor: true,
  hairStyle: true,
  headwear: true,
});

export type InsertWalkon = z.infer<typeof insertWalkonSchema>;
export type Walkon = typeof walkonPool.$inferSelect;

export const walkonBids = pgTable("walkon_bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  walkonPoolId: varchar("walkon_pool_id").notNull().references(() => walkonPool.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  bidAmount: integer("bid_amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWalkonBidSchema = createInsertSchema(walkonBids).pick({
  leagueId: true,
  walkonPoolId: true,
  teamId: true,
  bidAmount: true,
});
export type InsertWalkonBid = z.infer<typeof insertWalkonBidSchema>;
export type WalkonBid = typeof walkonBids.$inferSelect;

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
  minOverall: integer("min_overall").notNull().default(150),
  maxOverall: integer("max_overall").notNull().default(650),
  minStar: integer("min_star").notNull().default(1),
  maxStar: integer("max_star").notNull().default(5),
  revealedAbilitiesCount: integer("revealed_abilities_count").notNull().default(0),
  notes: text("notes"),
  boardRank: integer("board_rank"),
}, (t) => [
  index("idx_recruiting_interests_recruit_team").on(t.recruitId, t.teamId),
  index("idx_recruiting_interests_team_id").on(t.teamId),
]);

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
  boardRank: true,
});

export type InsertRecruitingInterest = z.infer<typeof insertRecruitingInterestSchema>;
export type RecruitingInterest = typeof recruitingInterests.$inferSelect;

// Transfer Portal Interests table (teams recruiting from transfer portal)
export const transferPortalInterests = pgTable("transfer_portal_interests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull().references(() => players.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  interestLevel: integer("interest_level").notNull().default(0),
  isTargeted: boolean("is_targeted").notNull().default(false),
  hasOffer: boolean("has_offer").notNull().default(false),
  notes: text("notes"),
});

export const insertTransferPortalInterestSchema = createInsertSchema(transferPortalInterests).pick({
  playerId: true,
  teamId: true,
  interestLevel: true,
  isTargeted: true,
  hasOffer: true,
  notes: true,
});

export type InsertTransferPortalInterest = z.infer<typeof insertTransferPortalInterestSchema>;
export type TransferPortalInterest = typeof transferPortalInterests.$inferSelect;

// Recruiting Actions Log table (tracks scout/phone/email actions by week)
export const recruitingActionsLog = pgTable("recruiting_actions_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recruitId: varchar("recruit_id").notNull().references(() => recruits.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  week: integer("week").notNull(),
  season: integer("season").notNull(),
  actionType: text("action_type").notNull(), // 'scout', 'phone', 'email', 'offer', 'visit'
  interestChange: integer("interest_change").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecruitingActionsLogSchema = createInsertSchema(recruitingActionsLog).pick({
  recruitId: true,
  teamId: true,
  leagueId: true,
  week: true,
  season: true,
  actionType: true,
  interestChange: true,
  notes: true,
});

export type InsertRecruitingActionsLog = z.infer<typeof insertRecruitingActionsLogSchema>;
export type RecruitingActionsLog = typeof recruitingActionsLog.$inferSelect;

// Top Schools Interest table (tracks which schools a recruit is interested in)
export const recruitTopSchools = pgTable("recruit_top_schools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recruitId: varchar("recruit_id").notNull().references(() => recruits.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  interestLevel: integer("interest_level").notNull().default(50), // 0-100 scale
  rank: integer("rank"), // Position in top schools list (1-8 during Open, 1-5 during Top 5, 1-3 during Top 3)
  isActive: boolean("is_active").notNull().default(true), // Whether still in consideration
  accumulatedInterest: integer("accumulated_interest").notNull().default(0), // Total interest accumulated from recruiting actions
}, (t) => [
  index("idx_recruit_top_schools_recruit_team").on(t.recruitId, t.teamId),
  index("idx_recruit_top_schools_team_id").on(t.teamId),
]);

export const insertRecruitTopSchoolsSchema = createInsertSchema(recruitTopSchools).pick({
  recruitId: true,
  teamId: true,
  interestLevel: true,
  rank: true,
  isActive: true,
  accumulatedInterest: true,
});

export type InsertRecruitTopSchools = z.infer<typeof insertRecruitTopSchoolsSchema>;
export type RecruitTopSchools = typeof recruitTopSchools.$inferSelect;

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
  boxScore: text("box_score"),
  isConference: boolean("is_conference").notNull().default(false),
  gameType: text("game_type"),
  bracketSide: text("bracket_side"),
  bracketRound: integer("bracket_round"),
  bracketType: text("bracket_type"),
  isManuallyReported: boolean("is_manually_reported").notNull().default(false),
  reportedByUserId: varchar("reported_by_user_id"),
}, (t) => [
  index("idx_games_league_season_week").on(t.leagueId, t.season, t.week),
]);

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
  boxScore: true,
  isConference: true,
  gameType: true,
  bracketSide: true,
  bracketRound: true,
  bracketType: true,
  isManuallyReported: true,
  reportedByUserId: true,
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
  email: text("email"),
  inviteCode: text("invite_code").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending, accepted, revoked
  teamId: varchar("team_id").references(() => teams.id),
  invitedById: varchar("invited_by_id").notNull().references(() => users.id),
  acceptedById: varchar("accepted_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  label: text("label"),
});

export const insertLeagueInviteSchema = createInsertSchema(leagueInvites).pick({
  leagueId: true,
  inviteCode: true,
  invitedById: true,
  expiresAt: true,
  label: true,
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
  category: text("category").notNull().default("general"),
  journalist: text("journalist"),
  season: integer("season"),
  week: integer("week"),
  imageUrl: text("image_url"),
  isSticky: boolean("is_sticky").notNull().default(false),
  isAutoGenerated: boolean("is_auto_generated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDynastyNewsSchema = createInsertSchema(dynastyNews).pick({
  leagueId: true,
  authorId: true,
  authorName: true,
  title: true,
  content: true,
  category: true,
  journalist: true,
  season: true,
  week: true,
  imageUrl: true,
  isSticky: true,
  isAutoGenerated: true,
});

export type InsertDynastyNews = z.infer<typeof insertDynastyNewsSchema>;
export type DynastyNews = typeof dynastyNews.$inferSelect;

// Player history/archive table - tracks graduated and departed players
export const playerHistory = pgTable("player_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position").notNull(),
  finalEligibility: text("final_eligibility").notNull(),
  overall: integer("overall").notNull().default(300),
  starRating: integer("star_rating").notNull().default(3),
  signingOvr: integer("signing_ovr"),
  departureType: text("departure_type").notNull().default("graduated"),
  draftRound: integer("draft_round"),
  departedSeason: integer("departed_season").notNull().default(1),
  seasonsPlayed: integer("seasons_played").notNull().default(1),
  abilities: json("abilities").$type<string[]>().default([]),
  homeState: text("home_state").notNull().default(""),
  hometown: text("hometown").notNull().default(""),
}, (t) => [
  index("idx_player_history_league_id").on(t.leagueId),
  index("idx_player_history_team_id").on(t.teamId),
]);

export const insertPlayerHistorySchema = createInsertSchema(playerHistory).pick({
  leagueId: true,
  teamId: true,
  firstName: true,
  lastName: true,
  position: true,
  finalEligibility: true,
  overall: true,
  starRating: true,
  signingOvr: true,
  departureType: true,
  draftRound: true,
  departedSeason: true,
  seasonsPlayed: true,
  abilities: true,
  homeState: true,
  hometown: true,
});

export type InsertPlayerHistory = z.infer<typeof insertPlayerHistorySchema>;
export type PlayerHistory = typeof playerHistory.$inferSelect;

// Player Promises table - tracks retention promises made to players
export const playerPromises = pgTable("player_promises", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  playerId: varchar("player_id").notNull().references(() => players.id),
  season: integer("season").notNull(),
  promiseType: text("promise_type").notNull(),
  promiseCategory: text("promise_category").notNull(),
  targetValue: text("target_value").notNull(),
  nilAmount: integer("nil_amount").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isMet: boolean("is_met"),
  evaluatedSeason: integer("evaluated_season"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerPromiseSchema = createInsertSchema(playerPromises).pick({
  leagueId: true,
  teamId: true,
  playerId: true,
  season: true,
  promiseType: true,
  promiseCategory: true,
  targetValue: true,
  nilAmount: true,
  isActive: true,
});

export type InsertPlayerPromise = z.infer<typeof insertPlayerPromiseSchema>;
export type PlayerPromise = typeof playerPromises.$inferSelect;

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

export const playerHistoryRelations = relations(playerHistory, ({ one }) => ({
  league: one(leagues, { fields: [playerHistory.leagueId], references: [leagues.id] }),
  team: one(teams, { fields: [playerHistory.teamId], references: [teams.id] }),
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

export const recruitingActionsLogRelations = relations(recruitingActionsLog, ({ one }) => ({
  recruit: one(recruits, { fields: [recruitingActionsLog.recruitId], references: [recruits.id] }),
  team: one(teams, { fields: [recruitingActionsLog.teamId], references: [teams.id] }),
  league: one(leagues, { fields: [recruitingActionsLog.leagueId], references: [leagues.id] }),
}));

export const recruitTopSchoolsRelations = relations(recruitTopSchools, ({ one }) => ({
  recruit: one(recruits, { fields: [recruitTopSchools.recruitId], references: [recruits.id] }),
  team: one(teams, { fields: [recruitTopSchools.teamId], references: [teams.id] }),
}));

export const transferPortalInterestsRelations = relations(transferPortalInterests, ({ one }) => ({
  player: one(players, { fields: [transferPortalInterests.playerId], references: [players.id] }),
  team: one(teams, { fields: [transferPortalInterests.teamId], references: [teams.id] }),
}));

export const playerPromisesRelations = relations(playerPromises, ({ one }) => ({
  league: one(leagues, { fields: [playerPromises.leagueId], references: [leagues.id] }),
  team: one(teams, { fields: [playerPromises.teamId], references: [teams.id] }),
  player: one(players, { fields: [playerPromises.playerId], references: [players.id] }),
}));

// Player Season Stats table - accumulated per-player, per-season statistics
export const playerSeasonStats = pgTable("player_season_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerId: varchar("player_id").notNull(),
  playerName: text("player_name").notNull(),
  teamId: varchar("team_id").notNull(),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  season: integer("season").notNull(),
  position: text("position").notNull(),
  games: integer("games").notNull().default(0),
  ab: integer("ab").notNull().default(0),
  r: integer("r").notNull().default(0),
  h: integer("h").notNull().default(0),
  doubles: integer("doubles").notNull().default(0),
  triples: integer("triples").notNull().default(0),
  hr: integer("hr").notNull().default(0),
  rbi: integer("rbi").notNull().default(0),
  bb: integer("bb").notNull().default(0),
  hbp: integer("hbp").notNull().default(0),
  so: integer("so").notNull().default(0),
  sb: integer("sb").notNull().default(0),
  cs: integer("cs").notNull().default(0),
  exitVeloTotal: real("exit_velo_total").notNull().default(0),
  barrels: integer("barrels").notNull().default(0),
  ballsInPlay: integer("balls_in_play").notNull().default(0),
  hardHits: integer("hard_hits").notNull().default(0),
  pitchingGames: integer("pitching_games").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  ipOuts: integer("ip_outs").notNull().default(0),
  pHits: integer("p_hits").notNull().default(0),
  pRuns: integer("p_runs").notNull().default(0),
  pEr: integer("p_er").notNull().default(0),
  pBb: integer("p_bb").notNull().default(0),
  pSo: integer("p_so").notNull().default(0),
  pHr: integer("p_hr").notNull().default(0),
  totalPitches: integer("total_pitches").notNull().default(0),
  whiffs: integer("whiffs").notNull().default(0),
  spinRateTotal: real("spin_rate_total").notNull().default(0),
  putouts: integer("putouts").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  fieldingErrors: integer("fielding_errors").notNull().default(0),
  totalChances: integer("total_chances").notNull().default(0),
  wpa: real("wpa").notNull().default(0),
}, (t) => [
  index("idx_player_season_stats_player_league").on(t.playerId, t.leagueId, t.season),
]);

export const insertPlayerSeasonStatsSchema = createInsertSchema(playerSeasonStats).omit({ id: true });
export type InsertPlayerSeasonStats = z.infer<typeof insertPlayerSeasonStatsSchema>;
export type PlayerSeasonStats = typeof playerSeasonStats.$inferSelect;

// Saved Rosters table - user-created roster sets
export const savedRosters = pgTable("saved_rosters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  basedOn: text("based_on").notNull().default("NCAA 2026"),
  rosterData: json("roster_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSavedRosterSchema = createInsertSchema(savedRosters).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedRoster = z.infer<typeof insertSavedRosterSchema>;
export type SavedRoster = typeof savedRosters.$inferSelect;

// Saved Recruiting Classes table - user-created recruiting class templates
export const savedRecruitingClasses = pgTable("saved_recruiting_classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  recruitCount: integer("recruit_count").notNull().default(80),
  classData: json("class_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSavedRecruitingClassSchema = createInsertSchema(savedRecruitingClasses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSavedRecruitingClass = z.infer<typeof insertSavedRecruitingClassSchema>;
export type SavedRecruitingClass = typeof savedRecruitingClasses.$inferSelect;

// ─── Storyline Recruit System ─────────────────────────────────────────────────

export interface StorylineHiddenVars {
  storyMomentum: number;   // 1-10: narrative energy this recruit carries
  volatility: number;      // 1-10: likelihood of major rating swings
  stability: number;       // 1-10: resistance to negative outcomes
  pressure: number;        // 1-10: current mental/physical pressure
  breakoutSeed: boolean;   // chance of breakout event this season
  collapseSeed: boolean;   // chance of collapse event this season
  ceilingModifier: number; // -20 to +20: permanent OVR ceiling shift from storyline
  loyaltySeed: number;     // 1-10: loyalty to their current top school
}

export interface ChoiceWeights {
  minor_pos: number;   // probability of minor positive (+1-3)
  moderate_pos: number;
  major_pos: number;
  legendary_pos: number;
  minor_neg: number;   // probability of minor negative (-1-3)
  moderate_neg: number;
  major_neg: number;
  legendary_neg: number;
  neutral: number;
}

export const storylineRecruits = pgTable("storyline_recruits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  recruitId: varchar("recruit_id").notNull().references(() => recruits.id),
  season: integer("season").notNull().default(1),
  archetype: text("archetype").notNull(),
  tier: text("tier").notNull(),
  hiddenVars: json("hidden_vars").$type<StorylineHiddenVars>().notNull(),
  currentArcStage: integer("current_arc_stage").notNull().default(0),
  isLegendary: boolean("is_legendary").notNull().default(false),
  imageUrl: text("image_url"),
  imagePrompt: text("image_prompt"),
  overlappingRecruitId: varchar("overlapping_recruit_id"),
  resolvedOvrDelta: integer("resolved_ovr_delta").notNull().default(0),
  usedTemplateIds: json("used_template_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqueLeagueSeasonRecruit: uniqueIndex("storyline_recruits_league_season_recruit_unique").on(t.leagueId, t.season, t.recruitId),
}));

export const insertStorylineRecruitSchema = createInsertSchema(storylineRecruits).omit({ id: true, createdAt: true });
export type InsertStorylineRecruit = z.infer<typeof insertStorylineRecruitSchema>;
export type StorylineRecruit = typeof storylineRecruits.$inferSelect;

export const storylineEvents = pgTable("storyline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  storylineRecruitId: varchar("storyline_recruit_id").notNull().references(() => storylineRecruits.id),
  season: integer("season").notNull().default(1),
  week: integer("week").notNull().default(1),
  eventText: text("event_text").notNull(),
  choiceA: text("choice_a").notNull(),
  choiceAOutcome: text("choice_a_outcome").notNull(),
  choiceAWeights: json("choice_a_weights").$type<ChoiceWeights>().notNull(),
  choiceB: text("choice_b").notNull(),
  choiceBOutcome: text("choice_b_outcome").notNull(),
  choiceBWeights: json("choice_b_weights").$type<ChoiceWeights>().notNull(),
  choiceC: text("choice_c").notNull(),
  choiceCOutcome: text("choice_c_outcome").notNull(),
  choiceCWeights: json("choice_c_weights").$type<ChoiceWeights>().notNull(),
  choiceD: text("choice_d"),
  choiceDOutcome: text("choice_d_outcome"),
  choiceDWeights: json("choice_d_weights").$type<ChoiceWeights>(),
  archetypeAtEvent: text("archetype_at_event"),  // recruit's archetype snapshot when this event was created
  templateId: text("template_id"),               // which event template was used (e.g. "lb_1") — shared image cache key
  eventImageUrl: text("event_image_url"),        // generated pixel art scene image for this event template
  resolvedChoice: text("resolved_choice"),
  resolvedOutcomeText: text("resolved_outcome_text"),
  ovrDelta: integer("ovr_delta"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStorylineEventSchema = createInsertSchema(storylineEvents).omit({ id: true, createdAt: true });
export type InsertStorylineEvent = z.infer<typeof insertStorylineEventSchema>;
export type StorylineEvent = typeof storylineEvents.$inferSelect;

export const storylineVotes = pgTable("storyline_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => storylineEvents.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  choice: text("choice").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqueEventTeam: uniqueIndex("storyline_votes_event_team_unique").on(t.eventId, t.teamId),
}));

export const insertStorylineVoteSchema = createInsertSchema(storylineVotes).omit({ id: true, createdAt: true });
export type InsertStorylineVote = z.infer<typeof insertStorylineVoteSchema>;
export type StorylineVote = typeof storylineVotes.$inferSelect;

// League Events table - activity feed for league news
// Game Reports table (manual reporting for multiplayer leagues)
export const gameReports = pgTable("game_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id).unique(),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  reporterUserId: varchar("reporter_user_id").notNull(),
  reporterTeamId: varchar("reporter_team_id").references(() => teams.id),
  // homeScore/awayScore = final run totals. Intentionally named to match the games table
  // convention (games.homeScore / games.awayScore). Spec referred to these as homeRuns/awayRuns
  // but both names represent the same data; this choice keeps cross-table joins unambiguous.
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  homeHits: integer("home_hits").notNull().default(0),
  awayHits: integer("away_hits").notNull().default(0),
  homeErrors: integer("home_errors").notNull().default(0),
  awayErrors: integer("away_errors").notNull().default(0),
  // inningScores shape: number[][] where each element is [awayRuns, homeRuns] for that inning.
  // e.g. [[0,1],[2,0],[0,3]] = away 2 runs, home 4 runs across 3 innings.
  // Note: columns are named homeScore/awayScore (not homeRuns/awayRuns) to align with the
  // game table naming convention. Both refer to the final run totals.
  inningScores: json("inning_scores").$type<number[][]>(),
  homeBoxData: json("home_box_data").$type<Record<string, unknown>>(),
  awayBoxData: json("away_box_data").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("pending"),
  confirmedByUserId: varchar("confirmed_by_user_id"),
  disputedByUserId: varchar("disputed_by_user_id"),
  disputeReason: text("dispute_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGameReportSchema = createInsertSchema(gameReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGameReport = z.infer<typeof insertGameReportSchema>;
export type GameReport = typeof gameReports.$inferSelect;

// Recruiting Class Snapshots — final class rankings captured at signing day finalization
export const recruitingClassSnapshots = pgTable("recruiting_class_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  season: integer("season").notNull(),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  classRank: integer("class_rank").notNull().default(0),
  classScore: real("class_score").notNull().default(0),
  totalCommits: integer("total_commits").notNull().default(0),
  fiveStars: integer("five_stars").notNull().default(0),
  fourStars: integer("four_stars").notNull().default(0),
  threeStars: integer("three_stars").notNull().default(0),
  twoStars: integer("two_stars").notNull().default(0),
  oneStars: integer("one_stars").notNull().default(0),
  avgOverall: real("avg_overall").notNull().default(0),
  avgStarRating: real("avg_star_rating").notNull().default(0),
  topRecruitName: text("top_recruit_name"),
  topRecruitOvr: integer("top_recruit_ovr"),
  topRecruitStars: integer("top_recruit_stars"),
});

export const insertRecruitingClassSnapshotSchema = createInsertSchema(recruitingClassSnapshots).omit({ id: true });
export type InsertRecruitingClassSnapshot = z.infer<typeof insertRecruitingClassSnapshotSchema>;
export type RecruitingClassSnapshot = typeof recruitingClassSnapshots.$inferSelect;

// Coach season history — one row per coach per completed season
export const coachSeasonHistory = pgTable("coach_season_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  coachId: varchar("coach_id").notNull().references(() => coaches.id),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  season: integer("season").notNull(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  confWins: integer("conf_wins").notNull().default(0),
  confLosses: integer("conf_losses").notNull().default(0),
  phaseResult: text("phase_result").notNull().default("regular_season"),
  classRank: integer("class_rank"),
  classScore: real("class_score"),
  classStarAvg: real("class_star_avg"),
  totalSigned: integer("total_signed").notNull().default(0),
  topRecruitName: text("top_recruit_name"),
  topRecruitOvr: integer("top_recruit_ovr"),
  topRecruitStars: integer("top_recruit_stars"),
  teamId: varchar("team_id"),
  teamName: text("team_name").notNull().default(""),
  teamAbbr: text("team_abbr").notNull().default(""),
  recruitingScore: real("recruiting_score"),
  recruitingGrade: text("recruiting_grade"),
  recruitingBreakdown: json("recruiting_breakdown").$type<Record<string, number>>(),
}, (t) => [
  index("idx_coach_season_history_coach_id").on(t.coachId),
  index("idx_coach_season_history_league_id").on(t.leagueId),
  uniqueIndex("idx_coach_season_history_unique").on(t.coachId, t.leagueId, t.season),
]);

export const insertCoachSeasonHistorySchema = createInsertSchema(coachSeasonHistory).omit({ id: true });
export type InsertCoachSeasonHistory = z.infer<typeof insertCoachSeasonHistorySchema>;
export type CoachSeasonHistory = typeof coachSeasonHistory.$inferSelect;

const LEAGUE_EVENT_TYPES = ["SIGNING", "TRANSFER", "DRAFT", "GAME_RESULT", "RIVALRY_RESULT", "AWARD", "PHASE_CHANGE", "ROSTER_CUT", "WALKON", "STORYLINE", "NUDGE", "DECOMMIT"] as const;
export type LeagueEventType = (typeof LEAGUE_EVENT_TYPES)[number];

// NIL Season Earnings table — records every NIL bonus awarded each season per team
export const nilSeasonEarnings = pgTable("nil_season_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  season: integer("season").notNull(),
  category: text("category").notNull(),
  amount: integer("amount").notNull().default(0),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("nil_season_earnings_unique").on(t.leagueId, t.teamId, t.season, t.category),
  index("idx_nil_season_earnings_league_team").on(t.leagueId, t.teamId),
]);

export const insertNilSeasonEarningSchema = createInsertSchema(nilSeasonEarnings).omit({ id: true, createdAt: true });
export type InsertNilSeasonEarning = z.infer<typeof insertNilSeasonEarningSchema>;
export type NilSeasonEarning = typeof nilSeasonEarnings.$inferSelect;

export const leagueEvents = pgTable("league_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull().references(() => leagues.id),
  teamId: varchar("team_id").references(() => teams.id),
  teamName: text("team_name"),
  teamAbbreviation: text("team_abbreviation"),
  teamPrimaryColor: text("team_primary_color"),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  season: integer("season").notNull().default(1),
  week: integer("week").notNull().default(1),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeagueEventSchema = createInsertSchema(leagueEvents).omit({ id: true, createdAt: true }).extend({
  eventType: z.enum(LEAGUE_EVENT_TYPES),
  metadata: z.record(z.unknown()).optional(),
});
export type InsertLeagueEvent = z.infer<typeof insertLeagueEventSchema>;
export type LeagueEvent = typeof leagueEvents.$inferSelect;

