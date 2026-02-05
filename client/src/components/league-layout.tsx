import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { TeamBadge } from "@/components/ui/team-badge";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  Target,
  Calendar,
  Shield,
  ArrowLeftRight,
  UserMinus,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import type { Team, League, Coach } from "@shared/schema";

interface LeagueLayoutProps {
  leagueId: string;
  children: React.ReactNode;
}

interface LeagueData {
  league: League;
  userTeam?: Team;
  coach?: Coach;
}

const phaseLabels: Record<string, string> = {
  preseason: "Preseason",
  spring_training: "Spring Training",
  regular_season: "Regular Season",
  super_regionals: "Super Regionals",
  cws: "College World Series",
  offseason: "Offseason",
  players_leaving: "Players Leaving",
  offseason_recruiting_1: "Early Recruiting",
  offseason_recruiting_2: "Mid Recruiting",
  offseason_recruiting_3: "Late Recruiting",
  offseason_recruiting_4: "Final Recruiting",
  signing_day: "Signing Day",
};

export function LeagueLayout({ leagueId, children }: LeagueLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: leagueData } = useQuery<LeagueData>({
    queryKey: ["/api/leagues", leagueId],
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const navItems = [
    { href: `/league/${leagueId}`, icon: LayoutDashboard, label: "League Home", exact: true },
    { href: `/league/${leagueId}/roster`, icon: Users, label: "Roster" },
    { href: `/league/${leagueId}/recruiting`, icon: Target, label: "Recruiting" },
    { href: `/league/${leagueId}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `/league/${leagueId}/transfer-portal`, icon: ArrowLeftRight, label: "Transfer Portal" },
    { href: `/league/${leagueId}/players-leaving`, icon: UserMinus, label: "Players Leaving" },
    { href: `/league/${leagueId}/commissioner`, icon: Shield, label: "Commissioner" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return location === href;
    }
    return location.startsWith(href);
  };

  const currentPhase = leagueData?.league?.currentPhase || "preseason";
  const currentWeek = leagueData?.league?.currentWeek || 1;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {leagueData?.userTeam && (
        <div className={cn(
          "p-4 border-b border-border",
          collapsed && "p-2"
        )}>
          <div className={cn(
            "flex items-center gap-3",
            collapsed && "justify-center"
          )}>
            <TeamBadge
              abbreviation={leagueData.userTeam.abbreviation}
              primaryColor={leagueData.userTeam.primaryColor}
              secondaryColor={leagueData.userTeam.secondaryColor || leagueData.userTeam.primaryColor}
              size="sm"
            />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="font-pixel text-gold text-xs truncate">
                  {leagueData.userTeam.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {leagueData.userTeam.mascot}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-4 py-2 border-b border-border">
          <Badge variant="outline" className="w-full justify-center text-xs">
            {phaseLabels[currentPhase] || currentPhase} • Week {currentWeek}
          </Badge>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  "hover:bg-card hover:text-gold",
                  active ? "bg-card text-gold border border-gold/30" : "text-muted-foreground",
                  collapsed && "justify-center px-2"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-card hover:text-gold transition-colors"
          data-testid="button-toggle-sidebar"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside
        className={cn(
          "hidden md:flex flex-col bg-background border-r border-border transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <SidebarContent />
      </aside>

      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-4 left-4 z-50 bg-gold text-background p-3 rounded-full shadow-lg"
        data-testid="button-mobile-menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-pixel text-gold text-sm">Navigation</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-muted-foreground hover:text-gold"
                data-testid="button-close-mobile-menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
