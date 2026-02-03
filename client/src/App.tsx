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
import InvitePage from "@/pages/invite";
import CoachProfilePage from "@/pages/coach-profile";
import { useState } from "react";
import { useLocation } from "wouter";

function Router() {
  return (
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
      <Route path="/league/:id/setup" component={LeagueSetupPage} />
      <Route path="/league/:id/dynasty-setup" component={DynastySetupPage} />
      <Route path="/league/:id/recruiting" component={RecruitingPage} />
      <Route path="/league/:id/roster" component={RosterPage} />
      <Route path="/league/:id/schedule" component={SchedulePage} />
      <Route path="/league/:id/commissioner" component={CommissionerPage} />
      <Route path="/league/:id/team/:teamId" component={TeamViewPage} />
      <Route path="/league/:id/coach" component={CoachProfilePage} />
      <Route path="/invite/:code" component={InvitePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GuestPage() {
  const [, setLocation] = useLocation();
  const [showWarning, setShowWarning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleContinueAsGuest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setShowWarning(false);
        setLocation("/dashboard");
      } else {
        console.error("Failed to create guest session");
      }
    } catch (error) {
      console.error("Guest login error:", error);
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
