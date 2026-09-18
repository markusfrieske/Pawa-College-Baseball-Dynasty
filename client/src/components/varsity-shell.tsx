import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { VarsityIcon } from "./ui/varsity-icon";
import { VolumeControl } from "./volume-control";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet";
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
  const search = useSearch();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location, search]);
  const match = location.match(/^\/league\/([^/]+)(?:\/([^/]+))?/);
  const leagueId = match?.[1];
  const inLeague = !!leagueId && !["create", "setup", "join"].includes(leagueId) && LEAGUE_PAGES.has(match?.[2] || "");
  const { data: league, isError: leagueError } = useQuery<ShellLeague>({ queryKey: ["/api/leagues", leagueId], enabled: inLeague });
  const { data: user } = useQuery<{ id: string }>({ queryKey: ["/api/auth/me"], enabled: inLeague });
  const { data: inbox } = useQuery<{ count: number }>({ queryKey: ["/api/leagues", leagueId, "messages", "unread-count"], enabled: inLeague && !!user, refetchInterval: 60_000 });
  if (!inLeague) return <><div className="fixed top-3 right-3 z-40"><VolumeControl /></div>{children}</>;

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
  const groups = [
    { title: "Your program", items: [links[0], links[1], { label: "Coach profile", path: "/coach" }, { label: "Program identity", path: "/identity" }, { label: "Settings", path: "/coach?tab=settings" }] },
    { title: "Recruiting", items: [links[2], { label: "Transfer portal", path: "/transfer-portal" }, { label: "Commits", path: "/commits" }, { label: "Departures", path: "/departures" }, { label: "Walk-ons", path: "/walkons" }] },
    { title: "Competition", items: [links[3], { label: "Standings", path: "?tab=standings" }, links[4], { label: "Postseason", path: "/postseason" }, { label: "Rivalries", path: "/rivalries" }] },
    { title: "League", items: [links[8], { label: "News", path: "?tab=news" }, { label: "League ticker", path: "/ticker" }, links[5], links[6], links[7], ...(commissioner ? [links[links.length - 1]] : [])] },
  ];
  const activePath = location + (search ? `?${search}` : "");
  const navLink = ({ label, path }: { label: string; path: string }, close = false) => {
    const href = `${base}${path}`;
    const active = path.includes("?") ? activePath === href : path === "/coach" && new URLSearchParams(search).get("tab") === "settings" ? false : path ? location === href || location.startsWith(`${href}/`) : location === href && !search;
    return <Link key={path} href={href} aria-current={active ? "page" : undefined} onClick={() => { if (close) setMenuOpen(false); }}>
      <VarsityIcon name={label} size={18} /><span>{label}</span>
      {path === "/inbox" && !!inbox?.count && <span className="varsity-unread" aria-label={`${inbox.count} unread messages`}>{inbox.count > 99 ? "99+" : inbox.count}</span>}
    </Link>;
  };

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
          {links.map(link => navLink(link))}
        </nav>
        <div className="varsity-sidebar-foot"><span>BUILD YOUR PROGRAM.</span><p>Every season<br />has a story.</p><Link href="/dashboard">Your dynasties</Link></div>
      </aside>
      <div className="varsity-gamebar" data-testid="game-topbar">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild><button type="button" className="varsity-menu-button" data-testid="game-menu-trigger"><VarsityIcon name="More" size={20} />Game menu</button></SheetTrigger>
          <SheetContent side="left" className="varsity-game-menu" data-testid="game-menu">
            <SheetHeader><SheetTitle>Your clubhouse</SheetTitle><SheetDescription>{team?.name || league?.name || "League navigation"}</SheetDescription></SheetHeader>
            <nav aria-label="All game destinations">{groups.map(group => <section key={group.title}><h2>{group.title}</h2>{group.items.map(link => navLink(link, true))}</section>)}<Link href="/dashboard" onClick={() => setMenuOpen(false)}>Your dynasties</Link></nav>
          </SheetContent>
        </Sheet>
        <div className="varsity-gamebar-identity"><strong>{team?.name || "PAWA"}</strong><span>{league?.name || "Your clubhouse"}</span></div>
        <VolumeControl />
      </div>
      <div id="varsity-main" className="varsity-main" tabIndex={-1}>{children}</div>
    </div>
  );
}
