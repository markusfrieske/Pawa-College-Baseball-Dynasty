# College Baseball Dynasty

## Overview
College Baseball Dynasty is a league-first, story-driven simulator where users manage college baseball programs. The project aims to provide a competitive environment for human coaches focusing on recruiting, roster management, and long-term program building within a retro pixel art aesthetic. The game envisions a robust multiplayer experience where coaches compete in a persistent league structure.

## User Preferences
- Dark mode only (no light mode toggle)
- Retro pixel aesthetic throughout
- Gold accent color for interactive elements
- Minimal use of emojis

## System Architecture
The application is built with a modern web stack: React, TypeScript, Vite, Tailwind CSS, and shadcn/ui for the frontend; Express.js and TypeScript for the backend; and PostgreSQL with Drizzle ORM for the database. State management utilizes TanStack Query, and Wouter handles frontend routing.

**Key Features:**

*   **League System**: Supports 4-16 teams, 2-4 conferences, CPU difficulty settings, and a 20-season maximum dynasty length. A commissioner system provides full authority and audit logging.
*   **Team Management**: Features 64 real college baseball programs with unique attributes (Stadium, Facilities, College Life, Marketing, Academics), NIL budget management, prestige ratings, and fanbase characteristics.
*   **Coach System**: Allows custom coach creation with various archetypes. Coaches progress through an XP system, leveling up to gain skill points for four recruiting-focused skill trees (Scouting, Evaluation, Pitching Recruiting, Hitting Recruiting), unlocking badges at higher levels.
*   **Rating System**: Players are rated on a 1-999 overall scale, translated into 1-5 star ratings. Players can possess 0-3 special abilities across Gold (elite positive), Blue (good positive), and Red (negative) tiers.
*   **Player Profile Cards**: Detailed player information is displayed across five sections: Name/Bio/Details, Numeric Attributes, Common Abilities (letter grades), Special Abilities (badges), and Career Stats (season-by-season history with batting/pitching stats).
*   **Recruiting (Fog of War)**: Features 80 recruits per class with specific star distribution: Blue Chip 5★ 3%, 5★ 5%, 4★ 12%, 3★ 60%, 2★ 15%, 1★ 5%. A "Blue Chip System" reveals top recruits' full details. A "Gem/Bust Mechanic" creates real recruiting uncertainty—gems (10% chance for 1-3★) have overall ratings 1-2 tiers above their star band, while busts (8% chance for 4-5★) have overall ratings 1-2 tiers below. Overall bands: Blue Chip 600-650, 5★ 500-625, 4★ 400-525, 3★ 300-450, 2★ 150-325, 1★ ≤175. Scouting progressively reveals recruit attributes and abilities, narrowing down rating ranges from unknown to exact values.
*   **Recruiting QoL**: Includes sorting options, a "Next Year Roster Forecast," personal notes, filter presets, comparison tool, pipeline summary widget (7-stage interest breakdown with position needs), interest trend indicators (up/down arrows from recent activity), position need highlighting ("NEED" badges), and scouting priority sort.
*   **League View QoL**: Awards tab (MVP, Pitcher of Year, Freshman of Year, All-Conference teams), Dynasty History tab (timeline of all past seasons with champions and W/L records), Offseason Recap banner (departure counts with player details), and Postseason Projection (bracket predictions based on current standings).
*   **Recruiting Actions**: Coaches interact with recruits through emails, phone calls, campus visits, and scholarship offers. Actions gain interest based on costs and priority matching (proximity, reputation, playing time, academics, prestige, facilities). Coach skills and school attributes modify effectiveness. Recruiting stages advance based on interest levels and weekly thresholds. CPU teams also engage in recruiting actions.
*   **Season Structure**: Progresses through phases: Preseason, Spring Training, Regular Season, Conference Championships, Super Regionals, CWS, Offseason, with a weekly advance system. Schedule follows real college baseball format: each week features a 3-game conference weekend series + 1 midweek OOC game (Standard/Long) or 1 conference game + 1 OOC game (Short). Season lengths: Short (5 weeks, 10 games), Standard (5 weeks, 20 games), Long (10 weeks, 40 games, each conference opponent played twice). Schedule auto-generates at dynasty start and each new season.
*   **Postseason System**: After regular season ends, automatic postseason flow: Conference Championships (top 2 teams per conference), Super Regionals (seeded single-elimination bracket, half the league qualifies, power-of-2 sizing with byes), College World Series (best-of-3 with alternating home teams). Game simulation uses roster strength from average player overall ratings with home advantage. Postseason data viewable on both commissioner page and league view Postseason tab. Falls back to previous season data when current season has no postseason.
*   **Draft Declaration System**: High-skill redshirt players can declare for the MLB Draft, removing them from the active roster.
*   **Transfer Portal System**: Players can enter the transfer portal (excluding graduates and draft declarations). Coaches can view departing players, recruit from the portal during the offseason, and track team interest.
*   **Commissioner Bulk Editing Tools**: Provides spreadsheet-like interfaces for bulk editing team rosters and recruiting classes, with inline editing, sortable columns, and keyboard navigation.
*   **League Invite System (Multiplayer)**: Commissioners can generate shareable invite links (similar to Discord server invites). Links are unique 12-character codes that can be shared via any channel. Anyone with the link can join the league by selecting an available CPU team. Commissioners can add labels to links, copy them to clipboard, and revoke active links. No email verification required.

*   **Advanced Statistics System**: Comprehensive stats tracking via `player_season_stats` table with 43+ fields. Game simulation generates synthetic Statcast data (exit velocity, barrel%, hard hit% based on power; spin rate, whiff rate based on stuff/velocity) and defensive metrics (putouts, assists, fielding errors by position with fielding rating influence). Stats accumulate after every simulated game across all phases. The Stats tab offers sub-views: Traditional (AVG/OPS/HR/RBI/WAR), Advanced (wOBA/wRC+/OPS+/BABIP), Statcast (Exit Velo/Barrel%/HardHit%), and Defense (FLD%/OAA/DRS) for batting; Traditional and Advanced (SIERA/K%/Whiff%/Spin Rate) for pitching. Career stats endpoint (`/api/leagues/:leagueId/players/:playerId/career-stats`) returns season-by-season computed stats displayed on player profile cards.

*   **Background Music System**: 11 unique .mp3 tracks (served from `client/public/music/`) mapped to specific screens and league phases. Managed via `MusicProvider` context (`client/src/lib/music-context.tsx`) wrapping the app. Features crossfade transitions, looping, volume control with slider, mute toggle, and localStorage persistence. `MusicRouter` (`client/src/components/music-router.tsx`) auto-selects tracks based on current route and league phase. `VolumeControl` (`client/src/components/volume-control.tsx`) provides a floating speaker icon in the bottom-right corner. Track mapping: Homepage=Game Start, My Dynasties/Dashboard/Setup through Preseason=Standings, Preseason/Spring Training/Regular Season=League Management, Recruiting=Recruiting, Commissioner=Graduation, Conference Champs/Super Regionals=Final Score, CWS=Playoffs, Offseason=Interview, Departures=Offseason, Signing Day=Predictions.

**Design System:**
The UI/UX adheres to a retro pixel aesthetic with a dark forest green background, gold accents for primary elements, and white/gold typography. The "Press Start 2P" font is used for headlines, and "Inter" for body text. Custom components like `RetroButton`, `RetroInput`, `RetroCard`, `TeamBadge`, `StarRating`, `AttributeSlider`, and `CoachAvatar` ensure a consistent retro look.

## External Dependencies

*   **Database**: PostgreSQL
*   **ORM**: Drizzle ORM
*   **Frontend Framework**: React
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS, shadcn/ui
*   **Backend Framework**: Express.js
*   **State Management/Data Fetching**: TanStack Query
*   **Routing**: Wouter (frontend)
*   **Type Checking**: TypeScript