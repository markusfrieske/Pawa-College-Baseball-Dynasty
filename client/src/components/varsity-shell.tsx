import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { VarsityIcon } from "./ui/varsity-icon";
import { MobileNav } from "./mobile-nav";
import { TeamBadge } from "./ui/team-badge";
import "./varsity-shell.css";

interface ShellLeague {
  name: string;
  commissionerId: string;
  coCommissionerIds?: string[] | null;
  teams?: Array<{
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    coach?: { userId: string } | null;
  }>;
}

const LEAGUE_PAGES = new Set([
  "", "war-room", "recruiting", "roster", "schedule", "commissioner", "edit-rosters", "edit-recruits",
  "players-leaving", "transfer-portal", "commits", "signing-day-reveal", "departures", "walkons",
  "storylines", "games", "game", "report-game", "postseason", "championship", "record-book",
  "archive", "ticker", "inbox", "rivalries", "identity", "stats", "digests", "team", "recruit", "coach",
]);

/** Persistent presentation shell. All actions continue to use the existing league routes. */
export function VarsityShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const match = location.match(/^\/league\/([^/]+)(?:\/([^/]+))?/);
  const leagueId = match?.[1];
  const inLeague = !!leagueId && !["create", "setup", "join"].includes(leagueId) && LEAGUE_PAGES.has(match?.[2] || "");
  const { data: league, isError: leagueError } = useQuery<ShellLeague>({ queryKey: ["/api/leagues", leagueId], enabled: inLeague });
  const { data: user } = useQuery<{ id: string }>({ queryKey: ["/api/auth/me"], enabled: inLeague });
  if (!inLeague) return <>{children}</>;

  const base = `/league/${leagueId}`;
  const team = user ? league?.teams?.find(t => t.coach?.userId === user.id) : undefined;
  const commissioner = !!user && !!league && (user.id === league.commissionerId || (Array.isArray(league.coCommissionerIds) && league.coCommissionerIds.includes(user.id)));
  const links = [
    { label: "Today", path: "" },
    { label: "Roster", path: "/roster" },
    { label: "Recruiting", path: "/recruiting" },
    { label: "Schedule", path: "/schedule" },
    { label: "Stats", path: "/stats" },
    { label: "Storylines", path: "/storylines" },
    { label: "Record book", path: "/record-book" },
    { label: "Archive", path: "/archive" },
    { label: "Coach inbox", path: "/inbox" },
    ...(commissioner ? [{ label: "Commissioner", path: "/commissioner" }] : []),
  ];

  return (
    <div className="varsity-shell" data-testid="varsity-shell">
      <a className="varsity-skip" href="#varsity-main">Skip to game content</a>
      <aside className="varsity-sidebar" aria-label="Your clubhouse">
        <Link href="/dashboard" className="varsity-brand" aria-label="PAWA — your dynasties">
          PAWA<span>COLLEGE BASEBALL DYNASTY</span>
        </Link>
        <div className="varsity-club">
          {team && <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} name={team.name} size="md" />}
          <div className="varsity-club-copy">
            {team && <strong>{team.name}</strong>}
            <span>{league?.name || (leagueError ? "League unavailable" : "Loading league…")}</span>
          </div>
        </div>
        <p className="varsity-nav-label">CLUBHOUSE</p>
        <nav aria-label="League navigation">
          {links.map(({ label, path }) => {
            const href = `${base}${path}`;
            const active = path ? location === href || location.startsWith(`${href}/`) : location === href;
            return <Link key={path} href={href} aria-current={active ? "page" : undefined}>
              <VarsityIcon name={label} size={18} /><span>{label}</span>
            </Link>;
          })}
        </nav>
        <div className="varsity-sidebar-foot"><span>BUILD YOUR PROGRAM.</span><p>Every season<br />has a story.</p><Link href="/dashboard">Your dynasties</Link></div>
      </aside>
      <div id="varsity-main" className="varsity-main" tabIndex={-1}>{children}</div>
      <MobileNav />
    </div>
  );
}
