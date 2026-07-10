import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Swords, Users, Target, Calendar, Menu, BarChart3, Newspaper,
  BookOpen, Sparkles, UserCircle, Settings, ShieldCheck, Trophy, Rss,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

const EXCLUDED_SEGMENTS = new Set(["create", "setup", "join"]);
const EXCLUDED_PATTERNS = /(\/dynasty-setup|\/team-selection|\/invite|\/setup)/;

interface LeagueForNav {
  id: string;
  commissionerId: string;
  coCommissionerIds?: string[] | null;
}

export function MobileNav() {
  const [location, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const leagueMatch = location.match(/^\/league\/([^/]+)/);
  const leagueId = leagueMatch ? leagueMatch[1] : null;
  const inLeagueContext = !!leagueId && !EXCLUDED_SEGMENTS.has(leagueId) && !EXCLUDED_PATTERNS.test(location);

  const { data: league } = useQuery<LeagueForNav>({
    queryKey: ["/api/leagues", leagueId],
    enabled: inLeagueContext,
  });

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
    enabled: inLeagueContext,
  });

  if (!inLeagueContext || !leagueId) return null;

  const leagueBase = `/league/${leagueId}`;
  const coCommIds: string[] = Array.isArray(league?.coCommissionerIds) ? (league!.coCommissionerIds as string[]) : [];
  const isCommissioner =
    !!currentUser && !!league && (currentUser.id === league.commissionerId || coCommIds.includes(currentUser.id));

  const primaryTabs = [
    { href: `${leagueBase}/war-room`, icon: Swords, label: "War Room", testId: "mobile-nav-war-room", exact: false, alsoActive: leagueBase },
    { href: `${leagueBase}/recruiting`, icon: Target, label: "Recruit", testId: "mobile-nav-recruiting", exact: false, alsoActive: undefined },
    { href: `${leagueBase}/schedule`, icon: Calendar, label: "Games", testId: "mobile-nav-games", exact: false, alsoActive: undefined },
    { href: `${leagueBase}/roster`, icon: Users, label: "Roster", testId: "mobile-nav-roster", exact: false, alsoActive: undefined },
  ] as const;

  const moreItems = [
    { href: `${leagueBase}/ticker`, icon: Rss, label: "League Ticker", testId: "more-nav-ticker" },
    { href: `${leagueBase}?tab=standings`, icon: BarChart3, label: "Standings", testId: "more-nav-standings" },
    { href: `${leagueBase}/stats`, icon: Trophy, label: "Stats", testId: "more-nav-stats" },
    { href: `${leagueBase}?tab=news`, icon: Newspaper, label: "News", testId: "more-nav-news" },
    { href: `${leagueBase}/record-book`, icon: BookOpen, label: "Record Book", testId: "more-nav-record-book" },
    { href: `${leagueBase}/storylines`, icon: Sparkles, label: "Storylines", testId: "more-nav-storylines" },
    { href: `${leagueBase}/coach`, icon: UserCircle, label: "Coach Profile", testId: "more-nav-coach-profile" },
    { href: `${leagueBase}/coach?tab=settings`, icon: Settings, label: "Settings", testId: "more-nav-settings" },
    ...(isCommissioner
      ? [{ href: `${leagueBase}/commissioner`, icon: ShieldCheck, label: "Commissioner Tools", testId: "more-nav-commissioner" }]
      : []),
  ];

  const isMoreActive =
    location === `${leagueBase}/ticker` ||
    location === `${leagueBase}/stats` ||
    location === `${leagueBase}/record-book` ||
    location === `${leagueBase}/storylines` ||
    location.startsWith(`${leagueBase}/coach`) ||
    location === `${leagueBase}/commissioner`;

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] md:hidden bg-card border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        data-testid="mobile-nav"
      >
        <div className="grid grid-cols-5 h-16">
          {primaryTabs.map(({ href, icon: Icon, label, testId, exact, alsoActive }) => {
            const isActive = exact ? location === href : (location.startsWith(href) || (!!alsoActive && location === alsoActive));
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors active:bg-white/5 min-h-[44px] ${
                  isActive ? "text-gold" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={testId}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] leading-none font-medium">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="More"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors active:bg-white/5 min-h-[44px] ${
              isMoreActive ? "text-gold" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="mobile-nav-more"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[9px] leading-none font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }} data-testid="sheet-more-menu">
          <SheetHeader>
            <SheetTitle className="font-pixel text-xs text-gold">More</SheetTitle>
            <SheetDescription className="sr-only">Additional navigation links</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-1">
            {moreItems.map(({ href, icon: Icon, label, testId }) => (
              <button
                key={testId}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(href);
                }}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left hover-elevate active-elevate-2 text-foreground min-h-[44px]"
                data-testid={testId}
              >
                <Icon className="w-4 h-4 text-gold flex-shrink-0" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
