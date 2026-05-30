/**
 * roster-scan-helper.ts
 *
 * Shared utilities for roster-editing scripts that scan TypeScript source files
 * line-by-line. Provides position-and-team-aware player context tracking so
 * scripts never accidentally modify a same-named player on a different team or
 * with a different position group.
 *
 * Usage:
 *   import { createPlayerContext, updatePlayerContext, isPitcher, nameTeamKey }
 *     from "./roster-scan-helper";
 *
 *   const ctx = createPlayerContext();
 *   for (const line of lines) {
 *     updatePlayerContext(line, ctx);
 *     if (!ctx.firstName || !ctx.lastName || !ctx.team) continue;
 *     const key = nameTeamKey(ctx); // "FirstName|LastName|TeamName"
 *     ...
 *   }
 */

export interface PlayerContext {
  firstName: string | null;
  lastName:  string | null;
  position:  string | null;
  team:      string | null;
}

/** Position strings that represent pitcher roles. */
export const PITCHER_POSITIONS = new Set(["P", "SP", "RP", "CP", "CL"]);

export function isPitcher(position: string | null): boolean {
  return position !== null && PITCHER_POSITIONS.has(position);
}

export function createPlayerContext(): PlayerContext {
  return { firstName: null, lastName: null, position: null, team: null };
}

/**
 * Update the mutable `ctx` object from a single source line.
 *
 * - Detects team declaration lines such as `  "LSU": [` and resets all
 *   player fields (a new team block has started).
 * - Extracts firstName / lastName / position from player object lines.
 *   All three fields commonly appear on the same opening `{` line, but
 *   the function also handles files where they appear on separate lines.
 */
export function updatePlayerContext(line: string, ctx: PlayerContext): void {
  // Team declaration: e.g.   "LSU": [  or  "Texas A&M": [
  const teamMatch = line.match(/^\s*"([^"]+)":\s*\[/);
  if (teamMatch) {
    ctx.team      = teamMatch[1];
    ctx.firstName = null;
    ctx.lastName  = null;
    ctx.position  = null;
    return;
  }

  const fnMatch  = line.match(/firstName:\s*"([^"]+)"/);
  const lnMatch  = line.match(/lastName:\s*"([^"]+)"/);
  const posMatch = line.match(/position:\s*"([^"]+)"/);

  if (fnMatch)  ctx.firstName = fnMatch[1];
  if (lnMatch)  ctx.lastName  = lnMatch[1];
  if (posMatch) ctx.position  = posMatch[1];
}

/**
 * Returns a composite key that uniquely identifies a player within the full
 * roster set: "FirstName|LastName|TeamName".
 *
 * Requires ctx.firstName, ctx.lastName, and ctx.team to be non-null; callers
 * should guard against nulls before calling this.
 */
export function nameTeamKey(ctx: PlayerContext): string {
  return `${ctx.firstName}|${ctx.lastName}|${ctx.team}`;
}

/**
 * Returns a key that disambiguates same-named players by position group
 * instead of team: "FirstName|LastName|pitcher" or "FirstName|LastName|hitter".
 *
 * Useful when team context is unavailable in the data model but you know
 * which position group a change should apply to.
 */
export function namePosGroupKey(ctx: PlayerContext): string {
  const group = isPitcher(ctx.position) ? "pitcher" : "hitter";
  return `${ctx.firstName}|${ctx.lastName}|${group}`;
}
