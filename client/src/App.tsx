import { Switch, Route, useParams } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useRef, lazy, Suspense, useEffect } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLocation, useSearch } from "wouter";
import { MusicProvider } from "@/lib/music-context";
import { MusicRouter } from "@/components/music-router";
import { VolumeControl } from "@/components/volume-control";
import { AtmosphereProvider, AtmosphereOverlay, SigningDayBurst, PostseasonBanner } from "@/components/atmosphere-provider";
import { AtmosphereRouter } from "@/components/atmosphere-router";
import { MobileNav } from "@/components/mobile-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { useToast } from "@/hooks/use-toast";
import { usePresence } from "@/hooks/use-presence";

const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/landing"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const LeagueCreatePage = lazy(() => import("@/pages/league-create"));
const LeagueViewPage = lazy(() => import("@/pages/league-view"));
const RecruitingPage = lazy(() => import("@/pages/recruiting"));
const TeamViewPage = lazy(() => import("@/pages/team-view"));
const SchedulePage = lazy(() => import("@/pages/schedule"));
const CommissionerPage = lazy(() => import("@/pages/commissioner"));
const RosterPage = lazy(() => import("@/pages/roster"));
const LeagueSetupPage = lazy(() => import("@/pages/league-setup"));
const DynastySetupPage = lazy(() => import("@/pages/dynasty-setup"));
const TeamSelectionPage = lazy(() => import("@/pages/team-selection"));
const InvitePage = lazy(() => import("@/pages/invite"));
const CoachProfilePage = lazy(() => import("@/pages/coach-profile"));
const CoachProfileByIdPage = lazy(() =>
  import("@/pages/coach-profile").then((m) => ({ default: m.CoachProfileByIdPage }))
);
const ProgramProfilePage = lazy(() => import("@/pages/program-profile"));
const RecruitProfilePage = lazy(() => import("@/pages/recruit-profile"));
const EditRostersPage = lazy(() => import("@/pages/edit-rosters"));
const EditRecruitsPage = lazy(() => import("@/pages/edit-recruits"));
const PlayersLeavingPage = lazy(() => import("@/pages/players-leaving"));
const TransferPortalPage = lazy(() => import("@/pages/transfer-portal"));
const CommitsPage = lazy(() => import("@/pages/commits"));
const SigningDayRevealPage = lazy(() => import("@/pages/signing-day-reveal"));
const DeparturesPage = lazy(() => import("@/pages/departures"));
const WalkonsPage = lazy(() => import("@/pages/walkons"));
const ManageRostersPage = lazy(() => import("@/pages/manage-rosters"));
const RosterViewerPage = lazy(() => import("@/pages/roster-viewer"));
const StorylinesPage = lazy(() => import("@/pages/storylines"));
const ManageRecruitingPage = lazy(() => import("@/pages/manage-recruiting"));
const ImportClassPage = lazy(() => import("@/pages/import-class"));
const PlayByPlayPage = lazy(() => import("@/pages/play-by-play"));
const ReportGamePage = lazy(() => import("@/pages/report-game"));
const PostseasonHubPage = lazy(() => import("@/pages/postseason-hub"));
const ChampionshipScreenPage = lazy(() => import("@/pages/championship-screen"));
const RecordBookPage = lazy(() => import("@/pages/record-book"));
const ArchivePage = lazy(() => import("@/pages/archive"));
const ArchiveTeamPage = lazy(() => import("@/pages/archive-team"));
const StatsPage = lazy(() => import("@/pages/stats"));
const DigestFeedPage = lazy(() => import("@/pages/digest-feed"));
const LeagueTickerPage = lazy(() => import("@/pages/league-ticker"));
const CoachInboxPage = lazy(() => import("@/pages/coach-inbox"));
const LeagueCreationProgressPage = lazy(() => import("@/pages/league-creation-progress"));
// War Room is retired — redirect to League Hub
function WarRoomRedirect() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  useEffect(() => { if (id) setLocation(`/league/${id}`, { replace: true }); }, [id, setLocation]);
  return null;
}
const RivalriesPage = lazy(() => import("@/pages/rivalries"));
const IdentityPage = lazy(() => import("@/pages/identity"));
const GamePrepPage = lazy(() => import("@/pages/game-prep"));

const AuthPageLazy = lazy(() => import("@/pages/auth"));
const GuestWarningModalLazy = lazy(() =>
  import("@/pages/auth").then((m) => ({ default: m.GuestWarningModal }))
);

const PageLoader = () => <div className="min-h-screen bg-background" />;

/**
 * Direction-aware page transition — slides forward/back based on URL depth,
 * fades on same-depth tab switches.
 */
function PageTransition({ children, location, direction }: {
  children: React.ReactNode;
  location: string;
  direction: "forward" | "back" | "fade";
}) {
  const cls = direction === "forward" ? "page-slide-forward"
    : direction === "back" ? "page-slide-back"
    : "page-fade-in";
  return (
    <div key={location} className={cls}>
      {children}
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const prevLocationRef = useRef(location);
  const directionRef = useRef<"forward" | "back" | "fade">("fade");

  if (location !== prevLocationRef.current) {
    const prevDepth = prevLocationRef.current.split("/").filter(Boolean).length;
    const currDepth = location.split("/").filter(Boolean).length;
    directionRef.current = currDepth > prevDepth ? "forward"
      : currDepth < prevDepth ? "back"
      : "fade";
    prevLocationRef.current = location;
  }

  return (
    <PageTransition location={location} direction={directionRef.current}>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/login">
            <AuthPageLazy mode="login" />
          </Route>
          <Route path="/register">
            <AuthPageLazy mode="register" />
          </Route>
          <Route path="/guest" component={GuestPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/league/create" component={LeagueCreatePage} />
          <Route path="/league/:id/war-room" component={WarRoomRedirect} />
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
          <Route path="/league/:id/creating" component={LeagueCreationProgressPage} />
          <Route path="/league/:id/storylines" component={StorylinesPage} />
          <Route path="/league/:id/games/:gameId/prep" component={GamePrepPage} />
          <Route path="/league/:id/game/:gameId/play-by-play" component={PlayByPlayPage} />
          <Route path="/league/:id/report-game/:gameId" component={ReportGamePage} />
          <Route path="/league/:id/postseason" component={PostseasonHubPage} />
          <Route path="/league/:id/championship/:season" component={ChampionshipScreenPage} />
          <Route path="/league/:id/record-book" component={RecordBookPage} />
          <Route path="/league/:id/archive/team/:teamId" component={ArchiveTeamPage} />
          <Route path="/league/:id/archive" component={ArchivePage} />
          <Route path="/league/:id/ticker" component={LeagueTickerPage} />
          <Route path="/league/:id/inbox" component={CoachInboxPage} />
          <Route path="/league/:id/rivalries" component={RivalriesPage} />
          <Route path="/league/:id/identity" component={IdentityPage} />
          <Route path="/league/:id/stats" component={StatsPage} />
          <Route path="/league/:id/digests" component={DigestFeedPage} />
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
      </Suspense>
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
      <Suspense fallback={<PageLoader />}>
        <GuestWarningModalLazy
          onBack={() => setLocation("/")}
          onContinue={handleContinueAsGuest}
          isLoading={isLoading}
        />
      </Suspense>
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
            <div className="fixed bottom-20 right-3 sm:bottom-auto sm:top-3 z-50" data-testid="music-controls-floating">
              <VolumeControl />
            </div>
            <OfflineBanner />
            <Toaster />
            <MobileNav />
            <div className="mobile-content-safe">
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </div>
          </MusicProvider>
        </AtmosphereProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
