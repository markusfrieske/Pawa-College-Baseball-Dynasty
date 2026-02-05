# College Baseball Dynasty

## Overview
A league-first, story-driven college baseball dynasty simulator where human coaches compete in recruiting, roster management, and long-term program building. Built with a retro pixel art aesthetic using Press Start 2P font and dark forest green/gold color scheme.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript  
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend), Express (backend)
- **State Management**: TanStack Query

## Project Structure
```
├── client/src/
│   ├── components/
│   │   ├── ui/              # Reusable UI components (retro-button, star-rating, team-badge, etc.)
│   │   └── coach-avatar.tsx  # Coach appearance renderer
│   ├── pages/
│   │   ├── landing.tsx       # Home/marketing page
│   │   ├── auth.tsx          # Login/Register screens
│   │   ├── dashboard.tsx     # User's leagues overview
│   │   ├── league-create.tsx # New league creation wizard
│   │   ├── league-setup.tsx  # Team selection + coach creation
│   │   ├── league-view.tsx   # League dashboard (standings, teams, rankings)
│   │   ├── recruiting.tsx    # Recruiting board with fog of war
│   │   ├── roster.tsx        # Team roster management
│   │   ├── schedule.tsx      # Game schedule with score entry
│   │   ├── team-view.tsx     # Individual team details
│   │   ├── commissioner.tsx  # Commissioner tools and audit log
│   │   ├── players-leaving.tsx # Players departing by team (graduates, draft, portal)
│   │   └── transfer-portal.tsx # Transfer portal recruiting interface
│   └── App.tsx               # Main app with routing
├── server/
│   ├── db.ts                 # Database connection
│   ├── storage.ts            # DatabaseStorage class with CRUD operations
│   ├── routes.ts             # API endpoints
│   └── index.ts              # Server entry point
└── shared/
    ├── schema.ts             # Drizzle schema + Zod types
    └── abilities.ts          # 100+ special abilities (pitcher/fielder/catcher, gold/blue/red tiers)
```

## Key Features

### League System
- Create leagues with 4-16 teams across 2-4 conferences
- CPU difficulty settings (Easy, Normal, Hard, Elite)
- 20-season maximum dynasty length
- Commissioner absolute authority with full audit logging

### Team Management
- Select from 64 real college baseball programs across 4 conferences:
  * SEC (16 teams): Alabama, Arkansas, Auburn, Florida, Georgia, Kentucky, LSU, Mississippi State, Missouri, Oklahoma, Ole Miss, South Carolina, Tennessee, Texas, Texas A&M, Vanderbilt
  * ACC (16 teams): Boston College, California, Clemson, Duke, Florida State, Georgia Tech, Louisville, Miami, NC State, North Carolina, Notre Dame, Pittsburgh, Stanford, Virginia, Virginia Tech, Wake Forest
  * Big 12 (14 teams): Arizona, Arizona State, Baylor, BYU, Cincinnati, Houston, Kansas, Kansas State, Oklahoma State, TCU, Texas Tech, UCF, Utah, West Virginia
  * Big Ten (18 teams): Illinois, Indiana, Iowa, Maryland, Michigan, Michigan State, Minnesota, Nebraska, Northwestern, Ohio State, Oregon, Penn State, Purdue, Rutgers, USC, UCLA, Washington, Wisconsin
- School attributes: Stadium, Facilities, College Life, Marketing, Academics
- NIL budget management (ranges from $1.5M to $6M based on program)
- Prestige ratings (5-9 based on baseball success)
- Fanbase passion (A+ to C) and type (Blue Blood, Academic Elite, Southern, Cult Following, etc.)

### Coach System
- Create custom coach with appearance options
- Coach archetypes: Balanced, Pure CEO, Player's Coach, Tactician, Old School
- 4 Recruiting-focused skill trees: Scouting, Evaluation, Pitching Recruiting, Hitting Recruiting
- XP System: 100 XP for wins, 25 XP for losses, 50-175 XP for signing recruits (based on star rank)
- Level up every 1000 XP, earning 1 skill point to spend on skill trees
- Skill badges unlocked at level 5 and 10 in each tree:
  - Scouting: Scout Master (5), Elite Scout (10) - faster scouting, earlier ability reveals
  - Evaluation: Talent Evaluator (5), Diamond Eye (10) - identify gems/busts earlier
  - Pitching: Arm Whisperer (5), Pitching Factory (10) - interest bonuses from pitchers
  - Hitting: Bat Magnet (5), Hitting Factory (10) - interest bonuses from hitters
- View any coach's profile from team pages (your own shows full details, rivals show career/badges only)

### Rating System (Updated)
- **Overall Rating**: 1-999 scale (replacing old 1-99 scale)
- **Star Rating**: 1-5 stars based on overall (5-star: 800+, 4-star: 600+, 3-star: 400+, 2-star: 200+, 1-star: below 200)
- **Special Abilities**: Players/recruits can have 0-3 special abilities
  - Gold tier: Elite positive abilities (e.g., "Explosive Fastball", "Monster Stuff")
  - Blue tier: Good positive abilities (e.g., "Heavy Ball", "Quick Hands")
  - Red tier: Negative abilities (e.g., "Choker", "Wild Pitches")
- **Abilities Assignment**: Higher-star players more likely to have multiple abilities, preferring gold tier

### Player Profile Card Structure
Player cards display 4 distinct sections:
1. **Name/Bio/Details**: Portrait, position badge, star rating, name, eligibility, bats/throws, hometown, overall rating
2. **Attributes (Numeric)**: For fielders: Contact, Power, Speed, Arm, Fielding, Error Resist. For pitchers: Velocity, Control, Stamina + Pitch Mix
3. **Common Abilities (Letter Grades G-A)**: 
   - Fielders: Clutch, vs LHP, Grit, Stealing, Running, Throwing, Recovery, Catcher (for C only)
   - Pitchers: W/RISP, vs Lefty, Poise, Grit, Heater, Agile, Recovery
4. **Special Abilities**: Gold/Blue/Red tier badges with descriptions

### Recruiting (Fog of War)
- 40-50 recruits per class with 1-5 star ratings
- **Star Distribution**: 5% 5-star, 10% 4-star, 40% 3-star, 30% 2-star, 15% 1-star
- **Blue Chip System**: Top 1-3 recruits have all ratings AND abilities automatically revealed
- **Gem/Bust Mechanic**: 8% gems (ranked lower than ability), 8% busts (ranked higher)
- **Progressive Reveal**: Scouting narrows rating ranges (??? → 400-800 → 550-700 → exact)
  - Unscouted: Overall shows "???", star rating shows "?"

### Recruiting QoL Features
- **Sort Options**: 6 sorting methods (Class Rank, Position Rank, Star Rating, Overall, Name, Scout Progress)
- **Next Year Roster Forecast**: Team needs indicator shows next year's roster depth after seniors graduate (max 25 players, excludes graduating seniors)
- **Notes System**: Personal notes on each recruit with database persistence
- **Filter Presets**: Save/load filter configurations to localStorage
- **Comparison Tool**: Select up to 3 recruits via checkbox to compare side-by-side stats in modal
  - Partially scouted: Shows ranges (e.g., "600-750", "3-4 stars")
  - Fully scouted (100%): Shows exact values
- **Abilities Reveal**: Abilities are progressively revealed as scouting percentage increases
- Hidden attributes revealed through scouting (0% → 15% → 100%)
- 6 priority categories: Proximity, Reputation, Playing Time, Academics, Prestige, Facilities
- Recruiting stages: Open → Top 8 → Top 5 → Top 3 → Verbal → Signed
- HS and JUCO recruit types

### Season Structure
- Phases: Preseason → Spring Training → Recruiting → Regular Season → Super Regionals → CWS → Offseason
- Weekly advance system requiring coach "ready up"
- Manual game score entry
- Conference and overall standings

### Draft Declaration System
- High-skill redshirt (RS) players can declare for the MLB Draft early
- Eligibility requirements: RS eligibility + 4+ star rating OR 700+ overall
- Declaration is irreversible - player is removed from active roster
- Commissioner or team coach can initiate draft declarations
- Declared players tracked in database with declaration date
- Audit log records all draft declarations

### Transfer Portal System
- **Players Leaving Summary** (`/league/:id/players-leaving`): View all departing players by team
  - Three categories: Graduates (Sr eligibility), Draft Declarations, Transfer Portal entries
  - Organized by team with collapsible accordion sections
  - Shows player name, position, eligibility, and star rating
- **Transfer Portal** (`/league/:id/transfer-portal`): Recruit players from other teams
  - Browse all players who have entered the portal
  - Target players and add personal notes (like recruiting board)
  - Sign players to your team during offseason
  - Security: Can't sign players from other leagues or your own players
- **Portal Entry**: Commissioner or team coach can enter players into portal
  - Seniors cannot enter portal (they're graduating)
  - Draft-declared players cannot enter portal
  - Players can leave via three paths: graduation, draft declaration, or transfer portal
- **Transfer Portal Interests**: Track which teams are interested in portal players
  - Similar structure to recruiting interests

### Commissioner Bulk Editing Tools
- **Edit All Rosters** (`/league/:id/edit-rosters`): Spreadsheet-like interface for bulk editing all team rosters
  - Tab-based team selection
  - Sortable columns (name, position, eligibility, overall, stars)
  - Inline editing for player names, positions, attributes
  - Pitch mix editing: FB/2S as checkboxes, SL/CB/CH/CT/SNK/SPL as 0-7 dropdowns
  - Unsaved changes tracking with yellow highlighting
  - Batch save with audit logging
  - **Keyboard Navigation**: Press Enter to move focus to the same field in the next row (skips disabled fields)
- **Edit Recruiting Class** (`/league/:id/edit-recruits`): Bulk editor for all recruits
  - Position filter dropdown
  - Sortable columns (rank, name, position, overall, stars)
  - Inline editing for names, position, type, year, attributes
  - Pitch mix editing for pitchers
  - Priority settings (Proximity, Reputation, Playing Time, Academics, Prestige, Facilities)
  - Batch save with commissioner audit logging
  - **Keyboard Navigation**: Press Enter to move focus to the same field in the next row (skips disabled fields)

### League Invite System (Multiplayer)
- Commissioner can send email invites via the Invites tab
- Unique 12-character invite codes generated using UUID
- Email verification on acceptance - user must log in with the invited email
- Invite flow: Create invite → Copy link → Share with friend → Friend signs up/logs in → Selects available CPU team → Team becomes human-controlled
- Accepting invite creates a coach and assigns it to the selected team
- Invite statuses: pending, accepted, expired
- Security: Email must match, team must be CPU, team must belong to invite's league

## Database Schema

Core tables:
- `users` - Authentication
- `leagues` - League configuration and state
- `conferences` - League subdivisions
- `teams` - School data and attributes
- `coaches` - User's coach characters
- `players` - Roster players with attributes
- `recruits` - Recruiting pool
- `recruiting_interests` - Team interest in recruits (fog of war state)
- `games` - Schedule and results
- `standings` - Season standings
- `audit_logs` - Commissioner action history
- `league_invites` - Email invites for multiplayer leagues

## API Routes

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Current user
- `POST /api/auth/guest` - Guest mode
- `POST /api/auth/logout` - Sign out

### Leagues
- `GET /api/leagues` - User's leagues
- `POST /api/leagues` - Create league
- `GET /api/leagues/:id` - League details
- `GET /api/leagues/:id/setup` - Setup data
- `POST /api/leagues/:id/setup` - Complete setup

### Recruiting
- `GET /api/leagues/:id/recruiting` - Recruiting board
- `POST /api/leagues/:id/recruiting/:recruitId/scout` - Scout recruit
- `POST /api/leagues/:id/recruiting/:recruitId/target` - Toggle target

### Roster/Schedule
- `GET /api/leagues/:id/roster` - Team roster
- `GET /api/leagues/:id/schedule` - Game schedule
- `PATCH /api/leagues/:id/games/:gameId` - Submit game score

### Commissioner
- `GET /api/leagues/:id/commissioner` - Commissioner data
- `POST /api/leagues/:id/advance` - Advance week
- `PATCH /api/leagues/:id/settings` - Update settings

### Invites
- `POST /api/leagues/:id/invites` - Create invite (commissioner only)
- `GET /api/invites/:code` - Get invite details by code
- `POST /api/invites/:code/accept` - Accept invite and join league

## Design System

### Colors
- **Background**: Dark forest green (#1a2b1a)
- **Primary/Accent**: Gold (#C4A35A)
- **Card**: Forest light (#243524)
- **Border**: Forest border (#2d3d2d)
- **Foreground**: White for body text, Gold for headings

### Typography
- **Headlines**: Press Start 2P (pixel font)
- **Body**: Inter

### Components
- `RetroButton` - Pixel-styled buttons with gold/outline variants
- `RetroInput` - Dark input fields with gold focus
- `RetroSelect` - Custom styled dropdowns
- `RetroCard` - Bordered card containers
- `TeamBadge` - Round team logo with colors
- `StarRating` - Colored star display (1-5)
- `AttributeSlider` - Progress bar for attributes
- `CoachAvatar` - SVG coach face renderer

## Running the Project

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The app runs on port 5000 with Vite HMR enabled.

## User Preferences
- Dark mode only (no light mode toggle)
- Retro pixel aesthetic throughout
- Gold accent color for interactive elements
- Minimal use of emojis
