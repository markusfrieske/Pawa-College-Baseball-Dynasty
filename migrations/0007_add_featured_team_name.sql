CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"details" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_season_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"conf_wins" integer DEFAULT 0 NOT NULL,
	"conf_losses" integer DEFAULT 0 NOT NULL,
	"phase_result" text DEFAULT 'regular_season' NOT NULL,
	"class_rank" integer,
	"class_score" real,
	"class_star_avg" real,
	"total_signed" integer DEFAULT 0 NOT NULL,
	"top_recruit_name" text,
	"top_recruit_ovr" integer,
	"top_recruit_stars" integer,
	"team_id" varchar,
	"team_name" text DEFAULT '' NOT NULL,
	"team_abbr" text DEFAULT '' NOT NULL,
	"recruiting_score" real,
	"recruiting_grade" text,
	"recruiting_breakdown" json
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"team_id" varchar,
	"league_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"archetype" text DEFAULT 'Balanced' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"scouting_skill" integer DEFAULT 1 NOT NULL,
	"evaluation_skill" integer DEFAULT 1 NOT NULL,
	"pitching_recruiting_skill" integer DEFAULT 1 NOT NULL,
	"hitting_recruiting_skill" integer DEFAULT 1 NOT NULL,
	"skin_tone" text DEFAULT 'light' NOT NULL,
	"hair_color" text DEFAULT 'brown' NOT NULL,
	"hair_style" text DEFAULT 'short' NOT NULL,
	"facial_hair" text DEFAULT 'none' NOT NULL,
	"eye_style" text DEFAULT 'normal' NOT NULL,
	"skill_tree_choices" json DEFAULT '[]'::json,
	"career_wins" integer DEFAULT 0 NOT NULL,
	"career_losses" integer DEFAULT 0 NOT NULL,
	"conf_wins" integer DEFAULT 0 NOT NULL,
	"conf_losses" integer DEFAULT 0 NOT NULL,
	"conf_championships" integer DEFAULT 0 NOT NULL,
	"cws_appearances" integer DEFAULT 0 NOT NULL,
	"national_championships" integer DEFAULT 0 NOT NULL,
	"coach_of_year_awards" integer DEFAULT 0 NOT NULL,
	"all_americans" integer DEFAULT 0 NOT NULL,
	"draft_picks" integer DEFAULT 0 NOT NULL,
	"legacy_score" integer DEFAULT 0 NOT NULL,
	"career_recruiting_score" real,
	"skill_points" integer DEFAULT 0 NOT NULL,
	"is_ready" boolean DEFAULT false NOT NULL,
	"scout_actions_used" integer DEFAULT 0 NOT NULL,
	"recruit_actions_used" integer DEFAULT 0 NOT NULL,
	"personality" text,
	"coaching_philosophy" json DEFAULT '[]'::json,
	"trait_badges" json DEFAULT '[]'::json,
	"career_milestones" json DEFAULT '[]'::json,
	"roster_strategy" text DEFAULT 'balanced' NOT NULL,
	"recruiting_geography_strategy" text DEFAULT 'national' NOT NULL,
	"recruiting_style_strategy" text DEFAULT 'best_available' NOT NULL,
	"game_philosophy_strategy" text DEFAULT 'balanced' NOT NULL,
	"auto_pilot_pending_alert" json DEFAULT '[]'::json
);
--> statement-breakpoint
CREATE TABLE "conferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dynasty_news" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"author_id" varchar,
	"author_name" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"journalist" text,
	"season" integer,
	"week" integer,
	"image_url" text,
	"is_sticky" boolean DEFAULT false NOT NULL,
	"is_auto_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"reporter_user_id" varchar NOT NULL,
	"reporter_team_id" varchar,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"home_hits" integer DEFAULT 0 NOT NULL,
	"away_hits" integer DEFAULT 0 NOT NULL,
	"home_errors" integer DEFAULT 0 NOT NULL,
	"away_errors" integer DEFAULT 0 NOT NULL,
	"inning_scores" json,
	"home_box_data" json,
	"away_box_data" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_by_user_id" varchar,
	"disputed_by_user_id" varchar,
	"dispute_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_reports_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"home_team_id" varchar NOT NULL,
	"away_team_id" varchar NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"is_complete" boolean DEFAULT false NOT NULL,
	"phase" text DEFAULT 'regular' NOT NULL,
	"box_score" text,
	"is_conference" boolean DEFAULT false NOT NULL,
	"game_type" text,
	"bracket_side" text,
	"bracket_round" integer,
	"bracket_type" text,
	"is_manually_reported" boolean DEFAULT false NOT NULL,
	"reported_by_user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "league_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"team_id" varchar,
	"team_name" text,
	"team_abbreviation" text,
	"team_primary_color" text,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"season" integer DEFAULT 1 NOT NULL,
	"week" integer DEFAULT 1 NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"email" text,
	"invite_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"team_id" varchar,
	"invited_by_id" varchar NOT NULL,
	"accepted_by_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"label" text,
	CONSTRAINT "league_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"commissioner_id" varchar NOT NULL,
	"max_teams" integer DEFAULT 16 NOT NULL,
	"cpu_difficulty" text DEFAULT 'high_school' NOT NULL,
	"season_length" text DEFAULT 'medium' NOT NULL,
	"current_season" integer DEFAULT 1 NOT NULL,
	"current_phase" text DEFAULT 'preseason' NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"audit_log_public" boolean DEFAULT true NOT NULL,
	"progression_enabled" boolean DEFAULT false NOT NULL,
	"phase_deadline" timestamp,
	"prev_power_rankings" json,
	"cpu_recruiting_aggression" integer DEFAULT 3 NOT NULL,
	"co_commissioner_ids" json DEFAULT '[]'::json,
	"email_digests_enabled" boolean DEFAULT true NOT NULL,
	"show_ready_names_to_all" boolean DEFAULT false NOT NULL,
	"last_walkon_auction" text
);
--> statement-breakpoint
CREATE TABLE "nil_season_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"category" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text NOT NULL,
	"final_eligibility" text NOT NULL,
	"overall" integer DEFAULT 300 NOT NULL,
	"star_rating" integer DEFAULT 3 NOT NULL,
	"signing_ovr" integer,
	"ovr_delta" integer,
	"departure_type" text DEFAULT 'graduated' NOT NULL,
	"draft_round" integer,
	"departed_season" integer DEFAULT 1 NOT NULL,
	"seasons_played" integer DEFAULT 1 NOT NULL,
	"abilities" json DEFAULT '[]'::json,
	"home_state" text DEFAULT '' NOT NULL,
	"hometown" text DEFAULT '' NOT NULL,
	"source_player_id" varchar
);
--> statement-breakpoint
CREATE TABLE "player_promises" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"promise_type" text NOT NULL,
	"promise_category" text NOT NULL,
	"target_value" text NOT NULL,
	"nil_amount" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_met" boolean,
	"evaluated_season" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_season_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"player_name" text NOT NULL,
	"team_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"position" text NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"ab" integer DEFAULT 0 NOT NULL,
	"r" integer DEFAULT 0 NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"doubles" integer DEFAULT 0 NOT NULL,
	"triples" integer DEFAULT 0 NOT NULL,
	"hr" integer DEFAULT 0 NOT NULL,
	"rbi" integer DEFAULT 0 NOT NULL,
	"bb" integer DEFAULT 0 NOT NULL,
	"hbp" integer DEFAULT 0 NOT NULL,
	"so" integer DEFAULT 0 NOT NULL,
	"sb" integer DEFAULT 0 NOT NULL,
	"cs" integer DEFAULT 0 NOT NULL,
	"exit_velo_total" real DEFAULT 0 NOT NULL,
	"barrels" integer DEFAULT 0 NOT NULL,
	"balls_in_play" integer DEFAULT 0 NOT NULL,
	"hard_hits" integer DEFAULT 0 NOT NULL,
	"pitching_games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ip_outs" integer DEFAULT 0 NOT NULL,
	"p_hits" integer DEFAULT 0 NOT NULL,
	"p_runs" integer DEFAULT 0 NOT NULL,
	"p_er" integer DEFAULT 0 NOT NULL,
	"p_bb" integer DEFAULT 0 NOT NULL,
	"p_so" integer DEFAULT 0 NOT NULL,
	"p_hr" integer DEFAULT 0 NOT NULL,
	"total_pitches" integer DEFAULT 0 NOT NULL,
	"whiffs" integer DEFAULT 0 NOT NULL,
	"spin_rate_total" real DEFAULT 0 NOT NULL,
	"putouts" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"fielding_errors" integer DEFAULT 0 NOT NULL,
	"total_chances" integer DEFAULT 0 NOT NULL,
	"wpa" real DEFAULT 0 NOT NULL,
	"end_season_ovr" integer
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text NOT NULL,
	"eligibility" text DEFAULT 'FR' NOT NULL,
	"throw_hand" text DEFAULT 'R' NOT NULL,
	"bat_hand" text DEFAULT 'R' NOT NULL,
	"home_state" text NOT NULL,
	"hometown" text NOT NULL,
	"jersey_number" integer NOT NULL,
	"overall" integer DEFAULT 300 NOT NULL,
	"star_rating" integer DEFAULT 3 NOT NULL,
	"hit_for_avg" integer DEFAULT 50,
	"power" integer DEFAULT 50,
	"speed" integer DEFAULT 50,
	"arm" integer DEFAULT 50,
	"fielding" integer DEFAULT 50,
	"error_resistance" integer DEFAULT 50,
	"clutch" integer DEFAULT 50,
	"vs_lhp" integer DEFAULT 50,
	"grit" integer DEFAULT 50,
	"stealing" integer DEFAULT 50,
	"running" integer DEFAULT 50,
	"throwing" integer DEFAULT 50,
	"recovery" integer DEFAULT 50,
	"catcher_ability" integer DEFAULT 50,
	"velocity" integer DEFAULT 50,
	"control" integer DEFAULT 50,
	"stamina" integer DEFAULT 50,
	"stuff" integer DEFAULT 50,
	"w_risp" integer DEFAULT 50,
	"vs_lefty" integer DEFAULT 50,
	"poise" integer DEFAULT 50,
	"heater" integer DEFAULT 50,
	"agile" integer DEFAULT 50,
	"pitch_fb" integer DEFAULT 1,
	"pitch_2s" integer DEFAULT 0,
	"pitch_sl" integer DEFAULT 0,
	"pitch_cb" integer DEFAULT 0,
	"pitch_ch" integer DEFAULT 0,
	"pitch_ct" integer DEFAULT 0,
	"pitch_snk" integer DEFAULT 0,
	"pitch_spl" integer DEFAULT 0,
	"pitch_shu" integer DEFAULT 0,
	"pitch_cch" integer DEFAULT 0,
	"pitch_hsl" integer DEFAULT 0,
	"pitch_swp" integer DEFAULT 0,
	"pitch_kn" integer DEFAULT 0,
	"pitch_vsl" integer DEFAULT 0,
	"pitch_sff" integer DEFAULT 0,
	"pitch_fk" integer DEFAULT 0,
	"pitch_scb" integer DEFAULT 0,
	"pitch_pcb" integer DEFAULT 0,
	"abilities" json DEFAULT '[]'::json,
	"trajectory" integer DEFAULT 2 NOT NULL,
	"declared_for_draft" boolean DEFAULT false NOT NULL,
	"draft_declaration_date" timestamp,
	"in_transfer_portal" boolean DEFAULT false NOT NULL,
	"portal_entry_date" timestamp,
	"portal_reason" text,
	"pending_departure" boolean DEFAULT false NOT NULL,
	"departure_type" text,
	"retention_status" text,
	"draft_ask_min" integer,
	"draft_ask_max" integer,
	"draft_round" integer,
	"nil_offered" integer,
	"signing_ovr" integer,
	"transfer_reason" text,
	"skin_tone" text DEFAULT 'light' NOT NULL,
	"hair_color" text DEFAULT 'brown' NOT NULL,
	"hair_style" text DEFAULT 'short' NOT NULL,
	"facial_hair" text DEFAULT 'none' NOT NULL,
	"eye_style" text DEFAULT 'standard' NOT NULL,
	"eyebrow_style" text DEFAULT 'flat' NOT NULL,
	"mouth_style" text DEFAULT 'neutral' NOT NULL,
	"eye_black" boolean DEFAULT false NOT NULL,
	"headwear" text DEFAULT 'cap' NOT NULL,
	"potential" integer,
	"depth_order" integer DEFAULT 0 NOT NULL,
	"batting_order" integer,
	"pitching_role" text,
	"lineup_position" text,
	"original_position" text,
	"progression_deltas" json,
	"tools" json DEFAULT '[]'::json,
	"work_ethic_score" integer DEFAULT 70 NOT NULL,
	"coachability" integer DEFAULT 70 NOT NULL,
	"last_pitched_outs" integer DEFAULT 0 NOT NULL,
	"last_pitched_week" integer,
	"last_pitched_day" text,
	"captain_role" text,
	"captain_season" integer
);
--> statement-breakpoint
CREATE TABLE "recruit_top_schools" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruit_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"interest_level" integer DEFAULT 50 NOT NULL,
	"rank" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"accumulated_interest" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiting_actions_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruit_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"week" integer NOT NULL,
	"season" integer NOT NULL,
	"action_type" text NOT NULL,
	"interest_change" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_auto_pilot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiting_class_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"import_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "recruiting_class_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "recruiting_class_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"team_id" varchar NOT NULL,
	"class_rank" integer DEFAULT 0 NOT NULL,
	"class_score" real DEFAULT 0 NOT NULL,
	"total_commits" integer DEFAULT 0 NOT NULL,
	"five_stars" integer DEFAULT 0 NOT NULL,
	"four_stars" integer DEFAULT 0 NOT NULL,
	"three_stars" integer DEFAULT 0 NOT NULL,
	"two_stars" integer DEFAULT 0 NOT NULL,
	"one_stars" integer DEFAULT 0 NOT NULL,
	"avg_overall" real DEFAULT 0 NOT NULL,
	"avg_star_rating" real DEFAULT 0 NOT NULL,
	"top_recruit_name" text,
	"top_recruit_ovr" integer,
	"top_recruit_stars" integer
);
--> statement-breakpoint
CREATE TABLE "recruiting_interests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recruit_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"interest_level" integer DEFAULT 0 NOT NULL,
	"scout_percentage" integer DEFAULT 0 NOT NULL,
	"is_targeted" boolean DEFAULT false NOT NULL,
	"has_offer" boolean DEFAULT false NOT NULL,
	"revealed_attributes" json DEFAULT '[]'::json,
	"min_overall" integer DEFAULT 150 NOT NULL,
	"max_overall" integer DEFAULT 650 NOT NULL,
	"min_star" integer DEFAULT 1 NOT NULL,
	"max_star" integer DEFAULT 5 NOT NULL,
	"revealed_abilities_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"board_rank" integer
);
--> statement-breakpoint
CREATE TABLE "recruits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text NOT NULL,
	"throw_hand" text DEFAULT 'R' NOT NULL,
	"bat_hand" text DEFAULT 'R' NOT NULL,
	"home_state" text NOT NULL,
	"hometown" text NOT NULL,
	"star_rank" integer DEFAULT 3 NOT NULL,
	"class_rank" integer NOT NULL,
	"position_rank" integer NOT NULL,
	"recruit_type" text DEFAULT 'HS' NOT NULL,
	"recruit_year" text DEFAULT 'FR' NOT NULL,
	"overall" integer DEFAULT 300 NOT NULL,
	"star_rating" integer DEFAULT 3 NOT NULL,
	"hit_for_avg" integer DEFAULT 50,
	"power" integer DEFAULT 50,
	"speed" integer DEFAULT 50,
	"arm" integer DEFAULT 50,
	"fielding" integer DEFAULT 50,
	"error_resistance" integer DEFAULT 50,
	"clutch" integer DEFAULT 50,
	"vs_lhp" integer DEFAULT 50,
	"grit" integer DEFAULT 50,
	"stealing" integer DEFAULT 50,
	"running" integer DEFAULT 50,
	"throwing" integer DEFAULT 50,
	"recovery" integer DEFAULT 50,
	"catcher_ability" integer DEFAULT 50,
	"velocity" integer DEFAULT 50,
	"control" integer DEFAULT 50,
	"stamina" integer DEFAULT 50,
	"stuff" integer DEFAULT 50,
	"w_risp" integer DEFAULT 50,
	"vs_lefty" integer DEFAULT 50,
	"poise" integer DEFAULT 50,
	"heater" integer DEFAULT 50,
	"agile" integer DEFAULT 50,
	"pitch_fb" integer DEFAULT 1,
	"pitch_2s" integer DEFAULT 0,
	"pitch_sl" integer DEFAULT 0,
	"pitch_cb" integer DEFAULT 0,
	"pitch_ch" integer DEFAULT 0,
	"pitch_ct" integer DEFAULT 0,
	"pitch_snk" integer DEFAULT 0,
	"pitch_spl" integer DEFAULT 0,
	"pitch_shu" integer DEFAULT 0,
	"pitch_cch" integer DEFAULT 0,
	"pitch_hsl" integer DEFAULT 0,
	"pitch_swp" integer DEFAULT 0,
	"pitch_kn" integer DEFAULT 0,
	"pitch_vsl" integer DEFAULT 0,
	"pitch_sff" integer DEFAULT 0,
	"pitch_fk" integer DEFAULT 0,
	"pitch_scb" integer DEFAULT 0,
	"pitch_pcb" integer DEFAULT 0,
	"abilities" json DEFAULT '[]'::json,
	"trajectory" integer DEFAULT 2 NOT NULL,
	"scouting_order" json DEFAULT '[]'::json,
	"proximity_priority" text DEFAULT 'Somewhat' NOT NULL,
	"reputation_priority" text DEFAULT 'Somewhat' NOT NULL,
	"playing_time_priority" text DEFAULT 'Somewhat' NOT NULL,
	"academics_priority" text DEFAULT 'Somewhat' NOT NULL,
	"prestige_priority" text DEFAULT 'Somewhat' NOT NULL,
	"facilities_priority" text DEFAULT 'Somewhat' NOT NULL,
	"college_life_priority" text DEFAULT 'Somewhat' NOT NULL,
	"dealbreaker" text,
	"commitment_threshold" integer DEFAULT 500 NOT NULL,
	"stage" text DEFAULT 'open' NOT NULL,
	"signed_team_id" varchar,
	"is_blue_chip" boolean DEFAULT false NOT NULL,
	"is_gem" boolean DEFAULT false NOT NULL,
	"is_bust" boolean DEFAULT false NOT NULL,
	"is_generational_gem" boolean DEFAULT false NOT NULL,
	"is_generational_bust" boolean DEFAULT false NOT NULL,
	"story_locked_abilities" json DEFAULT '[]'::json,
	"personality" text,
	"work_ethic" text,
	"gem_bust_revealed" boolean DEFAULT false NOT NULL,
	"source_player_id" varchar,
	"from_team_name" text,
	"skin_tone" text DEFAULT 'light' NOT NULL,
	"hair_color" text DEFAULT 'brown' NOT NULL,
	"hair_style" text DEFAULT 'short' NOT NULL,
	"facial_hair" text DEFAULT 'none' NOT NULL,
	"eye_style" text DEFAULT 'standard' NOT NULL,
	"eyebrow_style" text DEFAULT 'flat' NOT NULL,
	"mouth_style" text DEFAULT 'neutral' NOT NULL,
	"eye_black" boolean DEFAULT false NOT NULL,
	"headwear" text DEFAULT 'cap' NOT NULL,
	"potential" integer,
	"potential_floor" integer,
	"potential_ceiling" integer,
	"tools" json DEFAULT '[]'::json,
	"player_archetype" text DEFAULT 'normal' NOT NULL,
	"work_ethic_score" integer DEFAULT 70 NOT NULL,
	"coachability" integer DEFAULT 70 NOT NULL,
	"class_vintage" text,
	"nil_cost" integer DEFAULT 0 NOT NULL,
	"origin_prestige" integer,
	"signing_day_revealed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_recruiting_classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"recruit_count" integer DEFAULT 80 NOT NULL,
	"class_data" json NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saved_rosters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"based_on" text DEFAULT 'NCAA 2026' NOT NULL,
	"roster_data" json NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar,
	"league_id" varchar NOT NULL,
	"name" text NOT NULL,
	"perks" json DEFAULT '[]'::json,
	"downsides" json DEFAULT '[]'::json,
	"contract_years_remaining" integer DEFAULT 3 NOT NULL,
	"is_free_agent" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"season" integer NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"conference_wins" integer DEFAULT 0 NOT NULL,
	"conference_losses" integer DEFAULT 0 NOT NULL,
	"runs_scored" integer DEFAULT 0 NOT NULL,
	"runs_allowed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyline_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"storyline_recruit_id" varchar NOT NULL,
	"season" integer DEFAULT 1 NOT NULL,
	"week" integer DEFAULT 1 NOT NULL,
	"event_text" text NOT NULL,
	"choice_a" text NOT NULL,
	"choice_a_outcome" text NOT NULL,
	"choice_a_weights" json NOT NULL,
	"choice_b" text NOT NULL,
	"choice_b_outcome" text NOT NULL,
	"choice_b_weights" json NOT NULL,
	"choice_c" text NOT NULL,
	"choice_c_outcome" text NOT NULL,
	"choice_c_weights" json NOT NULL,
	"choice_d" text,
	"choice_d_outcome" text,
	"choice_d_weights" json,
	"archetype_at_event" text,
	"template_id" text,
	"event_image_url" text,
	"resolved_choice" text,
	"resolved_outcome_text" text,
	"ovr_delta" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyline_recruits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"recruit_id" varchar NOT NULL,
	"season" integer DEFAULT 1 NOT NULL,
	"archetype" text NOT NULL,
	"tier" text NOT NULL,
	"hidden_vars" json NOT NULL,
	"current_arc_stage" integer DEFAULT 0 NOT NULL,
	"is_legendary" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"image_prompt" text,
	"overlapping_recruit_id" varchar,
	"resolved_ovr_delta" integer DEFAULT 0 NOT NULL,
	"used_template_ids" json DEFAULT '[]'::json,
	"featured_team_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storyline_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"conference_id" varchar,
	"coach_id" varchar,
	"name" text NOT NULL,
	"mascot" text NOT NULL,
	"abbreviation" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zipcode" text,
	"primary_color" text DEFAULT '#0037ff' NOT NULL,
	"secondary_color" text DEFAULT '#FFD700' NOT NULL,
	"prestige" integer DEFAULT 5 NOT NULL,
	"stadium" integer DEFAULT 5 NOT NULL,
	"facilities" integer DEFAULT 5 NOT NULL,
	"college_life" integer DEFAULT 5 NOT NULL,
	"marketing" integer DEFAULT 5 NOT NULL,
	"academics" integer DEFAULT 5 NOT NULL,
	"fanbase_passion" text DEFAULT 'B' NOT NULL,
	"fanbase_type" text DEFAULT 'Balanced' NOT NULL,
	"enrollment" integer DEFAULT 30000 NOT NULL,
	"nil_budget" integer DEFAULT 3000000 NOT NULL,
	"nil_spent" integer DEFAULT 0 NOT NULL,
	"is_cpu" boolean DEFAULT true NOT NULL,
	"departures_finalized" boolean DEFAULT false NOT NULL,
	"walkon_ready" boolean DEFAULT false NOT NULL,
	"is_auto_pilot" boolean DEFAULT false NOT NULL,
	"auto_pilot_action_log" jsonb DEFAULT '[]'::jsonb,
	"national_rank" integer DEFAULT 149 NOT NULL,
	"prev_national_rank" integer,
	"recruiting_rank_boost" real DEFAULT 0 NOT NULL,
	"prev_prestige" integer,
	"prev_facilities" integer,
	"prev_academics" integer,
	"prev_stadium" integer,
	"prev_college_life" integer,
	"prestige_baseline" integer,
	"facilities_baseline" integer,
	"academics_baseline" integer,
	"stadium_baseline" integer,
	"college_life_baseline" integer
);
--> statement-breakpoint
CREATE TABLE "transfer_portal_interests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"interest_level" integer DEFAULT 0 NOT NULL,
	"is_targeted" boolean DEFAULT false NOT NULL,
	"has_offer" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "walkon_bids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"walkon_pool_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"bid_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "walkon_pool" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"position" text NOT NULL,
	"throw_hand" text DEFAULT 'R' NOT NULL,
	"bat_hand" text DEFAULT 'R' NOT NULL,
	"home_state" text NOT NULL,
	"hometown" text NOT NULL,
	"eligibility" text DEFAULT 'FR' NOT NULL,
	"overall" integer DEFAULT 200 NOT NULL,
	"star_rating" integer DEFAULT 1 NOT NULL,
	"hit_for_avg" integer DEFAULT 50,
	"power" integer DEFAULT 50,
	"speed" integer DEFAULT 50,
	"arm" integer DEFAULT 50,
	"fielding" integer DEFAULT 50,
	"error_resistance" integer DEFAULT 50,
	"clutch" integer DEFAULT 50,
	"vs_lhp" integer DEFAULT 50,
	"grit" integer DEFAULT 50,
	"stealing" integer DEFAULT 50,
	"running" integer DEFAULT 50,
	"throwing" integer DEFAULT 50,
	"recovery" integer DEFAULT 50,
	"catcher_ability" integer DEFAULT 50,
	"velocity" integer DEFAULT 50,
	"control" integer DEFAULT 50,
	"stamina" integer DEFAULT 50,
	"stuff" integer DEFAULT 50,
	"w_risp" integer DEFAULT 50,
	"vs_lefty" integer DEFAULT 50,
	"poise" integer DEFAULT 50,
	"heater" integer DEFAULT 50,
	"agile" integer DEFAULT 50,
	"abilities" json DEFAULT '[]'::json,
	"potential" integer,
	"signed_team_id" varchar,
	"signed_team_name" text,
	"is_generated" boolean DEFAULT false NOT NULL,
	"source_recruit_id" varchar,
	"skin_tone" text DEFAULT 'light' NOT NULL,
	"hair_color" text DEFAULT 'brown' NOT NULL,
	"hair_style" text DEFAULT 'short' NOT NULL,
	"headwear" text DEFAULT 'cap' NOT NULL,
	"awarded_team_id" varchar,
	"awarded_team_name" text,
	"awarded_price" integer
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_season_history" ADD CONSTRAINT "coach_season_history_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_season_history" ADD CONSTRAINT "coach_season_history_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conferences" ADD CONSTRAINT "conferences_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynasty_news" ADD CONSTRAINT "dynasty_news_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dynasty_news" ADD CONSTRAINT "dynasty_news_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reports" ADD CONSTRAINT "game_reports_reporter_team_id_teams_id_fk" FOREIGN KEY ("reporter_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_events" ADD CONSTRAINT "league_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_events" ADD CONSTRAINT "league_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_commissioner_id_users_id_fk" FOREIGN KEY ("commissioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nil_season_earnings" ADD CONSTRAINT "nil_season_earnings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nil_season_earnings" ADD CONSTRAINT "nil_season_earnings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_history" ADD CONSTRAINT "player_history_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_history" ADD CONSTRAINT "player_history_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_promises" ADD CONSTRAINT "player_promises_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_promises" ADD CONSTRAINT "player_promises_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_promises" ADD CONSTRAINT "player_promises_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_top_schools" ADD CONSTRAINT "recruit_top_schools_recruit_id_recruits_id_fk" FOREIGN KEY ("recruit_id") REFERENCES "public"."recruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruit_top_schools" ADD CONSTRAINT "recruit_top_schools_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_actions_log" ADD CONSTRAINT "recruiting_actions_log_recruit_id_recruits_id_fk" FOREIGN KEY ("recruit_id") REFERENCES "public"."recruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_actions_log" ADD CONSTRAINT "recruiting_actions_log_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_actions_log" ADD CONSTRAINT "recruiting_actions_log_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_class_shares" ADD CONSTRAINT "recruiting_class_shares_class_id_saved_recruiting_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."saved_recruiting_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_class_shares" ADD CONSTRAINT "recruiting_class_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_class_snapshots" ADD CONSTRAINT "recruiting_class_snapshots_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_class_snapshots" ADD CONSTRAINT "recruiting_class_snapshots_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_interests" ADD CONSTRAINT "recruiting_interests_recruit_id_recruits_id_fk" FOREIGN KEY ("recruit_id") REFERENCES "public"."recruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting_interests" ADD CONSTRAINT "recruiting_interests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruits" ADD CONSTRAINT "recruits_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruits" ADD CONSTRAINT "recruits_signed_team_id_teams_id_fk" FOREIGN KEY ("signed_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_recruiting_classes" ADD CONSTRAINT "saved_recruiting_classes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_rosters" ADD CONSTRAINT "saved_rosters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_events" ADD CONSTRAINT "storyline_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_events" ADD CONSTRAINT "storyline_events_storyline_recruit_id_storyline_recruits_id_fk" FOREIGN KEY ("storyline_recruit_id") REFERENCES "public"."storyline_recruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_recruits" ADD CONSTRAINT "storyline_recruits_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_recruits" ADD CONSTRAINT "storyline_recruits_recruit_id_recruits_id_fk" FOREIGN KEY ("recruit_id") REFERENCES "public"."recruits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_votes" ADD CONSTRAINT "storyline_votes_event_id_storyline_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."storyline_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_votes" ADD CONSTRAINT "storyline_votes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_conference_id_conferences_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_portal_interests" ADD CONSTRAINT "transfer_portal_interests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_portal_interests" ADD CONSTRAINT "transfer_portal_interests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkon_bids" ADD CONSTRAINT "walkon_bids_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkon_bids" ADD CONSTRAINT "walkon_bids_walkon_pool_id_walkon_pool_id_fk" FOREIGN KEY ("walkon_pool_id") REFERENCES "public"."walkon_pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkon_bids" ADD CONSTRAINT "walkon_bids_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkon_pool" ADD CONSTRAINT "walkon_pool_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walkon_pool" ADD CONSTRAINT "walkon_pool_signed_team_id_teams_id_fk" FOREIGN KEY ("signed_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_coach_season_history_coach_id" ON "coach_season_history" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "idx_coach_season_history_league_id" ON "coach_season_history" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_coach_season_history_unique" ON "coach_season_history" USING btree ("coach_id","league_id","season");--> statement-breakpoint
CREATE INDEX "idx_coaches_team_id" ON "coaches" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_coaches_league_id" ON "coaches" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_games_league_season_week" ON "games" USING btree ("league_id","season","week");--> statement-breakpoint
CREATE UNIQUE INDEX "nil_season_earnings_unique" ON "nil_season_earnings" USING btree ("league_id","team_id","season","category");--> statement-breakpoint
CREATE INDEX "idx_nil_season_earnings_league_team" ON "nil_season_earnings" USING btree ("league_id","team_id");--> statement-breakpoint
CREATE INDEX "idx_player_history_league_id" ON "player_history" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_player_history_team_id" ON "player_history" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_player_season_stats_player_league" ON "player_season_stats" USING btree ("player_id","league_id","season");--> statement-breakpoint
CREATE INDEX "idx_players_team_id" ON "players" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_recruit_top_schools_recruit_team" ON "recruit_top_schools" USING btree ("recruit_id","team_id");--> statement-breakpoint
CREATE INDEX "idx_recruit_top_schools_team_id" ON "recruit_top_schools" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_recruiting_actions_team_league_season" ON "recruiting_actions_log" USING btree ("team_id","league_id","season");--> statement-breakpoint
CREATE INDEX "idx_recruiting_interests_recruit_team" ON "recruiting_interests" USING btree ("recruit_id","team_id");--> statement-breakpoint
CREATE INDEX "idx_recruiting_interests_team_id" ON "recruiting_interests" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_recruits_league_id" ON "recruits" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storyline_recruits_league_season_recruit_unique" ON "storyline_recruits" USING btree ("league_id","season","recruit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storyline_votes_event_team_unique" ON "storyline_votes" USING btree ("event_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "walkon_bids_unique" ON "walkon_bids" USING btree ("walkon_pool_id","team_id");