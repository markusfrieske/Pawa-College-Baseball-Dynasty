import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Home, Users, Target, Calendar, Menu, BarChart3, Newspaper,
  BookOpen, Sparkles, UserCircle, Settings, ShieldCheck, Trophy, Rss,
  Inbox,
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

  const { data: inboxCount } = useQuery<{ count: number }>({
    queryKey: ["/api/leagues", leagueId, "messages", "unread-count"],
    queryFn: () =>
      fetch(`/api/leagues/${leagueId}/messages/unread-count`, { credentials: "include" })
        .then(r => r.json()),
    enabled: inLeagueContext && !!currentUser,
    refetchInterval: 60_000,
  });
  const unreadInbox = inboxCount?.count ?? 0;

  if (!inLeagueContext || !leagueId) return null;

  const leagueBase = `/league/${leagueId}`;
  const coCommIds: string[] = Array.isArray(league?.coCommissionerIds) ? (league!.coCommissionerIds as string[]) : [];
  const isCommissioner =
    !!currentUser && !!league && (currentUser.id === league.commissionerId || coCommIds.includes(currentUser.id));

  const primaryTabs = [
    { href: leagueBase, icon: Home, label: "Hub", testId: "mobile-nav-hub", exact: true, alsoActive: undefined },
    { href: `${leagueBase}/recruiting`, icon: Target, label: "Recruit", testId: "mobile-nav-recruiting", exact: false, alsoActive: undefined },
    { href: `${leagueBase}/schedule`, icon: Calendar, label: "Games", testId: "mobile-nav-games", exact: false, alsoActive: undefined },
    { href: `${leagueBase}/roster`, icon: Users, label: "Roster", testId: "mobile-nav-roster", exact: false, alsoActive: undefined },
  ] as const;

  const moreItems = [
    { href: `${leagueBase}/inbox`, icon: Inbox, label: "Coach Inbox", testId: "more-nav-inbox", badge: unreadInbox > 0 ? (unreadInbox > 99 ? "99+" : String(unreadInbox)) : null },
    { href: `${leagueBase}/ticker`, icon: Rss, label: "League Ticker", testId: "more-nav-ticker", badge: null },
    { href: `${leagueBase}?tab=standings`, icon: BarChart3, label: "Standings", testId: "more-nav-standings", badge: null },
    { href: `${leagueBase}/stats`, icon: Trophy, label: "Stats", testId: "more-nav-stats", badge: null },
    { href: `${leagueBase}?tab=news`, icon: Newspaper, label: "News", testId: "more-nav-news", badge: null },
    { href: `${leagueBase}/record-book`, icon: BookOpen, label: "Record Book", testId: "more-nav-record-book", badge: null },
    { href: `${leagueBase}/storylines`, icon: Sparkles, label: "Storylines", testId: "more-nav-storylines", badge: null },
    { href: `${leagueBase}/coach`, icon: UserCircle, label: "Coach Profile", testId: "more-nav-coach-profile", badge: null },
    { href: `${leagueBase}/coach?tab=settings`, icon: Settings, label: "Settings", testId: "more-nav-settings", badge: null },
    ...(isCommissioner
      ? [{ href: `${leagueBase}/commissioner`, icon: ShieldCheck, label: "Commissioner Tools", testId: "more-nav-commissioner", badge: null }]
      : []),
  ];

  const isMoreActive =
    location === `${leagueBase}/inbox` ||
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
                <span className="text-xs leading-none font-medium">{label}</span>
              </Link>
            );
          })}
          {/* More button — shows a gold dot when there are unread inbox messages */}
          <button
            type="button"
            aria-label="More"
            onClick={() => setMoreOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors active:bg-white/5 min-h-[44px] ${
              isMoreActive ? "text-gold" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="mobile-nav-more"
          >
            <span className="relative">
              <Menu className="w-5 h-5" />
              {unreadInbox > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-gold text-xs font-bold text-black leading-none"
                  data-testid="badge-more-unread"
                  aria-label={`${unreadInbox} unread messages`}
                >
                  {unreadInbox > 9 ? "9+" : unreadInbox}
                </span>
              )}
            </span>
            <span className="text-xs leading-none font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }} data-testid="sheet-more-menu">
          <SheetHeader>
            <SheetTitle className="text-xs font-semibold text-gold">More</SheetTitle>
            <SheetDescription className="sr-only">Additional navigation links</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-1">
            {moreItems.map(({ href, icon: Icon, label, testId, badge }) => (
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
                <span className="flex-1 text-sm font-medium">{label}</span>
                {badge && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-gold text-xs font-bold text-black">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
