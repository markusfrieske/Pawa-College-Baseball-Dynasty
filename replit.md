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
*   **Player Profile Cards**: Detailed player information is displayed across four sections: Name/Bio/Details, Numeric Attributes, Common Abilities (letter grades), and Special Abilities (badges).
*   **Recruiting (Fog of War)**: Features 40-50 recruits per class with a varied star distribution. A "Blue Chip System" reveals top recruits' full details. A "Gem/Bust Mechanic" introduces hidden potential or overvaluation. Scouting progressively reveals recruit attributes and abilities, narrowing down rating ranges from unknown to exact values.
*   **Recruiting QoL**: Includes sorting options, a "Next Year Roster Forecast," personal notes, filter presets, comparison tool, pipeline summary widget (7-stage interest breakdown with position needs), interest trend indicators (up/down arrows from recent activity), position need highlighting ("NEED" badges), and scouting priority sort.
*   **League View QoL**: Awards tab (MVP, Pitcher of Year, Freshman of Year, All-Conference teams), Dynasty History tab (timeline of all past seasons with champions and W/L records), Offseason Recap banner (departure counts with player details), and Postseason Projection (bracket predictions based on current standings).
*   **Recruiting Actions**: Coaches interact with recruits through emails, phone calls, campus visits, and scholarship offers. Actions gain interest based on costs and priority matching (proximity, reputation, playing time, academics, prestige, facilities). Coach skills and school attributes modify effectiveness. Recruiting stages advance based on interest levels and weekly thresholds. CPU teams also engage in recruiting actions.
*   **Season Structure**: Progresses through phases: Preseason, Spring Training, Regular Season, Conference Championships, Super Regionals, CWS, Offseason, with a weekly advance system.
*   **Postseason System**: After regular season ends, automatic postseason flow: Conference Championships (top 2 teams per conference), Super Regionals (seeded single-elimination bracket, half the league qualifies, power-of-2 sizing with byes), College World Series (best-of-3 with alternating home teams). Game simulation uses roster strength from average player overall ratings with home advantage. Postseason data viewable on both commissioner page and league view Postseason tab. Falls back to previous season data when current season has no postseason.
*   **Draft Declaration System**: High-skill redshirt players can declare for the MLB Draft, removing them from the active roster.
*   **Transfer Portal System**: Players can enter the transfer portal (excluding graduates and draft declarations). Coaches can view departing players, recruit from the portal during the offseason, and track team interest.
*   **Commissioner Bulk Editing Tools**: Provides spreadsheet-like interfaces for bulk editing team rosters and recruiting classes, with inline editing, sortable columns, and keyboard navigation.
*   **League Invite System (Multiplayer)**: Commissioners can generate unique 12-character invite codes for email invitations, allowing users to join leagues and take control of CPU teams after email verification.

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