import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import AuthPage, { GuestWarningModal } from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import LeagueCreatePage from "@/pages/league-create";
import LeagueViewPage from "@/pages/league-view";
import RecruitingPage from "@/pages/recruiting";
import TeamViewPage from "@/pages/team-view";
import SchedulePage from "@/pages/schedule";
import CommissionerPage from "@/pages/commissioner";
import RosterPage from "@/pages/roster";
import LeagueSetupPage from "@/pages/league-setup";
import DynastySetupPage from "@/pages/dynasty-setup";
import TeamSelectionPage from "@/pages/team-selection";
import InvitePage from "@/pages/invite";
import CoachProfilePage, { CoachProfileByIdPage } from "@/pages/coach-profile";
import ProgramProfilePage from "@/pages/program-profile";
import RecruitProfilePage from "@/pages/recruit-profile";
import EditRostersPage from "@/pages/edit-rosters";
import EditRecruitsPage from "@/pages/edit-recruits";
import PlayersLeavingPage from "@/pages/players-leaving";
import TransferPortalPage from "@/pages/transfer-portal";
import CommitsPage from "@/pages/commits";
import SigningDayRevealPage from "@/pages/signing-day-reveal";
import DeparturesPage from "@/pages/departures";
import WalkonsPage from "@/pages/walkons";
import ManageRostersPage from "@/pages/manage-rosters";
import RosterViewerPage from "@/pages/roster-viewer";
import StorylinesPage from "@/pages/storylines";
import ManageRecruitingPage from "@/pages/manage-recruiting";
import ImportClassPage from "@/pages/import-class";
import PlayByPlayPage from "@/pages/play-by-play";
import ReportGamePage from "@/pages/report-game";
import PostseasonHubPage from "@/pages/postseason-hub";
import RecordBookPage from "@/pages/record-book";
import StatsPage from "@/pages/stats";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { MusicProvider } from "@/lib/music-context";
import { MusicRouter } from "@/components/music-router";
import { VolumeControl } from "@/components/volume-control";
import { AtmosphereProvider, AtmosphereOverlay, SigningDayBurst, PostseasonBanner } from "@/components/atmosphere-provider";
import { AtmosphereRouter } from "@/components/atmosphere-router";
import { MobileNav } from "@/components/mobile-nav";
import { useToast } from "@/hooks/use-toast";
import { usePresence } from "@/hooks/use-presence";

/**
 * Thin page-transition wrapper — applies a quick fade+slide-up
 * whenever the active route changes, keyed on the pathname.
 */
function PageTransition({ children, location }: { children: React.ReactNode; location: string }) {
  return (
    <div key={location} className="page-fade-in">
      {children}
    </div>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <PageTransition location={location}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login">
          <AuthPage mode="login" />
        </Route>
        <Route path="/register">
          <AuthPage mode="register" />
        </Route>
        <Route path="/guest" component={GuestPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/league/create" component={LeagueCreatePage} />
        <Route path="/league/:id" component={LeagueViewPage} />
        <Route path="/league/:id/team-selection" component={TeamSelectionPage} />
        <Route path="/league/:id/setup" component={LeagueSetupPage} />
        <Route path="/league/:id/dynasty-setup" component={DynastySetupPage} />
        <Route path="/league/:id/recruiting" component={RecruitingPage} />
        <Route path="/league/:id/roster" component={RosterPage} />
        <Route path="/league/:id/schedule" component={SchedulePage} />
        <Route path="/league/:id/commissioner" component={CommissionerPage} />
        <Route path="/league/:id/edit-rosters" component={EditRostersPage} />
        <Route path="/league/:id/edit-recruits" component={EditRecruitsPage} />
        <Route path="/league/:id/players-leaving" component={PlayersLeavingPage} />
        <Route path="/league/:id/transfer-portal" component={TransferPortalPage} />
        <Route path="/league/:id/commits" component={CommitsPage} />
        <Route path="/league/:id/signing-day-reveal" component={SigningDayRevealPage} />
        <Route path="/league/:id/departures" component={DeparturesPage} />
        <Route path="/league/:id/walkons" component={WalkonsPage} />
        <Route path="/league/:id/storylines" component={StorylinesPage} />
        <Route path="/league/:id/game/:gameId/play-by-play" component={PlayByPlayPage} />
        <Route path="/league/:id/report-game/:gameId" component={ReportGamePage} />
        <Route path="/league/:id/postseason" component={PostseasonHubPage} />
        <Route path="/league/:id/record-book" component={RecordBookPage} />
        <Route path="/league/:id/stats" component={StatsPage} />
        <Route path="/league/:id/team/:teamId/profile" component={ProgramProfilePage} />
        <Route path="/league/:id/team/:teamId" component={TeamViewPage} />
        <Route path="/league/:id/recruit/:recruitId" component={RecruitProfilePage} />
        <Route path="/league/:id/coach" component={CoachProfilePage} />
        <Route path="/league/:id/coach/:coachId" component={CoachProfileByIdPage} />
        <Route path="/coach/:coachId" component={CoachProfileByIdPage} />
        <Route path="/manage-rosters" component={ManageRostersPage} />
        <Route path="/roster-viewer" component={RosterViewerPage} />
        <Route path="/manage-recruiting" component={ManageRecruitingPage} />
        <Route path="/import-class/:token" component={ImportClassPage} />
        <Route path="/invite/:code" component={InvitePage} />
        <Route component={NotFound} />
      </Switch>
    </PageTransition>
  );
}

function GuestPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [showWarning, setShowWarning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const redirectTarget = (() => {
    const params = new URLSearchParams(search);
    const r = params.get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    return "/dashboard";
  })();

  const handleContinueAsGuest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setShowWarning(false);
        setLocation(redirectTarget);
      } else {
        let message = "Could not start guest session. Please try again.";
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch {}
        toast({ title: "Guest login failed", description: message, variant: "destructive" });
      }
    } catch {
      toast({
        title: "Connection error",
        description: "Could not reach the server. Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (showWarning) {
    return (
      <GuestWarningModal
        onBack={() => setLocation("/")}
        onContinue={handleContinueAsGuest}
        isLoading={isLoading}
      />
    );
  }

  return null;
}

function PresenceTracker() {
  usePresence();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AtmosphereProvider>
          <MusicProvider>
            <PresenceTracker />
            <AtmosphereOverlay />
            <PostseasonBanner />
            <SigningDayBurst />
            <AtmosphereRouter />
            <MusicRouter />
            <div className="fixed bottom-16 right-3 sm:bottom-auto sm:top-3 z-50" data-testid="music-controls-floating">
              <VolumeControl />
            </div>
            <Toaster />
            <MobileNav />
            <div className="pb-16 md:pb-0">
              <Router />
            </div>
          </MusicProvider>
        </AtmosphereProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
