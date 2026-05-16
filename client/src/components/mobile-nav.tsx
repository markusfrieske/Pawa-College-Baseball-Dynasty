import { useLocation, Link } from "wouter";
import { Home, Users, Target, Calendar, Settings } from "lucide-react";

const SETUP_ROUTES = /(\/setup|\/dynasty-setup|\/team-selection|\/invite)/;

export function MobileNav() {
  const [location] = useLocation();

  const leagueMatch = location.match(/^\/league\/([^/]+)/);
  if (!leagueMatch || SETUP_ROUTES.test(location)) return null;

  const leagueId = leagueMatch[1];
  const leagueBase = `/league/${leagueId}`;

  const tabs = [
    { href: leagueBase, icon: Home, label: "League", testId: "mobile-nav-league", exact: true },
    { href: `${leagueBase}/roster`, icon: Users, label: "Roster", testId: "mobile-nav-roster", exact: false },
    { href: `${leagueBase}/recruiting`, icon: Target, label: "Recruit", testId: "mobile-nav-recruiting", exact: false },
    { href: `${leagueBase}/schedule`, icon: Calendar, label: "Schedule", testId: "mobile-nav-schedule", exact: false },
    { href: `${leagueBase}/commissioner`, icon: Settings, label: "Settings", testId: "mobile-nav-commissioner", exact: false },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] md:hidden bg-card border-t border-border"
      data-testid="mobile-nav"
    >
      <div className="grid grid-cols-5 h-16">
        {tabs.map(({ href, icon: Icon, label, testId, exact }) => {
          const isActive = exact ? location === href : location.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors active:bg-white/5 min-h-[44px] ${
                isActive ? "text-gold" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={testId}
            >
              <Icon className="w-5 h-5" />
              <span className="font-pixel text-[7px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
