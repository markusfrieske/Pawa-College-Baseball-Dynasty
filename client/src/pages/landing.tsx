import { Link } from "wouter";
import { useState, useEffect } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import {
  Trophy, Star, User, Bug, Layers, LogOut,
  DollarSign, X, Search, Binoculars,
  Crown, Eye, Zap, Swords, ClipboardList, UserPlus, ChevronRight,
  ArrowRight, GitMerge, TrendingUp, BarChart3
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DynastyLogo } from "@/components/dynasty-logo";


export default function LandingPage() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Signed out successfully" });
    },
  });

  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 pr-14 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DynastyLogo className="w-10 h-10" />
            <span className="font-pixel text-gold text-sm hidden sm:block">
              パワプロ College Baseball Dynasty
            </span>
          </div>

          {isLoggedIn ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 text-gold" data-testid="display-user">
                <User className="w-5 h-5" />
                <span className="font-pixel text-[8px] sm:text-[10px] hidden sm:block truncate max-w-[100px]">
                  {user.email.split("@")[0]}
                </span>
              </div>
              <RetroButton variant="ghost" size="icon" onClick={() => setShowFeedbackModal(true)} title="Submit Feedback" data-testid="button-feedback">
                <Bug className="w-4 h-4" />
              </RetroButton>
              <Link href="/dashboard">
                <RetroButton variant="ghost" size="icon" title="My Dynasties" data-testid="button-my-dynasties">
                  <Layers className="w-4 h-4" />
                </RetroButton>
              </Link>
              <RetroButton variant="ghost" size="icon" onClick={() => logoutMutation.mutate()} title="Sign Out" data-testid="button-signout">
                <LogOut className="w-4 h-4" />
              </RetroButton>
              <a href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com" target="_blank" rel="noopener noreferrer">
                <RetroButton variant="ghost" size="icon" title="Donate" data-testid="link-donate">
                  <DollarSign className="w-4 h-4" />
                </RetroButton>
              </a>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link href="/login">
                <RetroButton variant="outline" size="sm" data-testid="link-login">Sign In</RetroButton>
              </Link>
              <Link href="/register">
                <RetroButton size="sm" data-testid="link-register">Sign Up</RetroButton>
              </Link>
            </div>
          )}
        </div>
      </header>

      {showFeedbackModal && <FeedbackModal onClose={() => setShowFeedbackModal(false)} />}

      <main>
        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="relative py-20 sm:py-28 px-4 overflow-hidden">
          {/* Pixel grid */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(#d4a843 1px, transparent 1px), linear-gradient(90deg, #d4a843 1px, transparent 1px)", backgroundSize: "48px 48px" }}
          />
          {/* Radial gold bloom — cinematic hero atmosphere */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 65% 55% at 50% 30%, rgba(196,163,90,0.09) 0%, transparent 70%)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 pointer-events-none" />

          <div className="container mx-auto text-center relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 border border-gold/30 bg-gold/5 px-4 py-1.5 mb-8 text-gold/80 text-[10px] font-pixel tracking-wider">
              <span className="text-gold">◆</span> SEASON 2026 · OPEN BETA <span className="text-gold">◆</span>
            </div>

            <div className="flex justify-center gap-1.5 mb-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className="w-5 h-5 text-gold fill-gold animate-pulse"
                  style={{
                    animationDelay: `${i * 0.12}s`,
                    filter: "drop-shadow(0 0 4px rgba(196,163,90,0.75))",
                  }}
                />
              ))}
            </div>

            <h1
              className="font-pixel text-gold leading-tight mb-6"
              style={{
                fontSize: "clamp(1.8rem, 6vw, 3.5rem)",
                textShadow: "0 0 24px rgba(196,163,90,0.30), 0 0 60px rgba(196,163,90,0.12)",
              }}
            >
              College<br />Baseball<br />Dynasty
            </h1>

            <p className="text-foreground/70 text-lg leading-relaxed max-w-xl mx-auto mb-8">
              The most immersive college baseball management sim. Recruit real talent, build your program, and compete against other coaches in a persistent league.
            </p>

            {/* Feature pills with staggered fade-in */}
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {[
                "130+ Programs",
                "3,500+ Real Players",
                "12 Conferences",
                "Transfer Portal",
                "MLB Draft",
                "43+ Tracked Stats",
                "Postseason Bracket",
                "Multiplayer Leagues",
              ].map((pill, i) => (
                <span
                  key={pill}
                  className="border border-gold/25 bg-gold/5 text-gold/70 text-[9px] font-pixel px-3 py-1.5 tracking-wide"
                  style={{
                    animation: "page-fade 200ms ease-out both",
                    animationDelay: `${60 + i * 40}ms`,
                  }}
                >
                  {pill}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Link href="/register">
                <RetroButton variant="shimmer" size="lg" className="w-full sm:w-auto px-10" data-testid="button-get-started">
                  Start Your Dynasty
                </RetroButton>
              </Link>
              <Link href="/guest">
                <RetroButton variant="outline" size="lg" className="w-full sm:w-auto px-10" data-testid="button-guest-mode">
                  Try as Guest
                </RetroButton>
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={isLoggedIn ? "/manage-rosters" : "/guest?redirect=/manage-rosters"}>
                <RetroButton variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-manage-rosters">
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Manage Rosters
                </RetroButton>
              </Link>
              <Link href={isLoggedIn ? "/manage-recruiting" : "/guest?redirect=/manage-recruiting"}>
                <RetroButton variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-manage-recruiting">
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Manage Recruiting Class
                </RetroButton>
              </Link>
            </div>
          </div>
        </section>

        {/* ── GAME PREVIEW TERMINAL ─────────────────────────── */}
        <section className="px-4 pb-20">
          <div className="container mx-auto max-w-4xl">
            <GamePreviewTerminal />
            <p className="text-center text-[10px] font-pixel text-muted-foreground/50 mt-3 tracking-wider">
              REAL PLAYERS · FULL SEASON CYCLE · FOG OF WAR RECRUITING
            </p>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <h2 className="font-pixel text-gold text-center text-lg mb-12">How It Works</h2>
            <div className="grid sm:grid-cols-3 gap-px bg-border">
              {[
                { step: "01", icon: <Crown className="w-7 h-7" />, title: "Create Your League", desc: "Set up a dynasty with 4–16 teams across real conferences. Invite friends or fill CPU slots — then set the difficulty." },
                { step: "02", icon: <Binoculars className="w-7 h-7" />, title: "Scout & Recruit", desc: "Recruits per class scale to your league size — up to 80 with fog-of-war ratings. Spend weekly actions on calls, visits, and NIL offers to land talent, then manage the transfer portal and walk-on pool each offseason." },
                { step: "03", icon: <Trophy className="w-7 h-7" />, title: "Compete Every Week", desc: "Advance through Preseason, Regular Season, Conference Championships, Super Regionals, and the College World Series. Every result is permanent dynasty history." },
              ].map((item) => (
                <div key={item.step} className="bg-background p-8 flex flex-col items-center text-center gap-4">
                  <div className="font-pixel text-[10px] text-gold/40 tracking-widest">{item.step}</div>
                  <div className="text-gold">{item.icon}</div>
                  <h3 className="font-pixel text-[10px] text-foreground tracking-wide">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURE: RECRUITING ─────────────────────────────── */}
        <section className="py-20 px-4 border-t border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 01</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">Fog-of-War Recruiting</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Every recruit starts hidden. Spend scouting actions to progressively reveal their true overall rating, attributes, and special abilities. A 3-star recruit might be a generational gem in disguise.
                </p>
                <ul className="space-y-3">
                  {[
                    "Recruit class scales to league size (30–80) — Blue Chips, Generational Gems, and Busts hidden in every class",
                    "Scouting progressively narrows ratings from unknown ranges to exact values",
                    "Per-recruit weekly action limits: 1 phone call, 1 email, 1 visit, 1 offer per dynasty",
                    "Priority color-coding shows which school factors each recruit actually cares about",
                    "CPU teams use the same multiplier stack as human coaches — no artificial advantages",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border bg-card/60 overflow-hidden">
                <img
                  src="/screenshots/pipeline.jpg"
                  alt="In-game recruit pipeline showing stage-by-stage interest breakdown and position needs"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE: PLAYER PROFILES ────────────────────────── */}
        <section className="py-20 px-4 border-t border-border bg-card/30">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 border border-border bg-card/60 overflow-hidden">
                <img
                  src="/screenshots/player-card.jpg"
                  alt="In-game player profile card showing real attributes, special ability badges, and career stats"
                  className="w-full h-auto block"
                />
              </div>
              <div className="order-1 md:order-2">
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 02</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">Deep Player Systems</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Every player carries 22 numeric attributes, letter grades across 8 common skills, and up to 7 special ability badges. Real 2026 rosters for all 12 conferences — 3,500+ actual players. Advanced stats track 43+ fields including Statcast metrics, wOBA, wRC+, and OAA.
                </p>
                <ul className="space-y-3">
                  {[
                    "150–650 overall scale translates to 1–5 star ratings",
                    "Gold, Blue, and Red special ability badge tiers with 0–7 per player",
                    "Advanced stats: wOBA, wRC+, BABIP, SIERA, exit velocity, barrel%, OAA",
                    "Eligibility tracking, sophomore progression, and career season-by-season history",
                    "MLB Draft projections for departing seniors and declared juniors",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE: COMPETITION ────────────────────────────── */}
        <section className="py-20 px-4 border-t border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 03</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">League-First Competition</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Designed for multiplayer from the ground up. Every recruiting decision, week advance, and championship win is permanent dynasty history. The commissioner system keeps leagues moving — deadlines, audit logs, and stall detection included.
                </p>
                <ul className="space-y-3">
                  {[
                    "Conference Championships, Super Regionals, and College World Series postseason",
                    "Power Rankings with composite scores, week-over-week trend tracking, and sortable grades",
                    "Notification center — activity feed tracks CPU signings, portal moves, and phase changes",
                    "Commissioner tools: phase deadlines, bulk roster editing, stall detection, audit logs",
                    "Invite links for easy multiplayer onboarding — no email verification required",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border bg-card/40 overflow-hidden">
                <img
                  src="/screenshots/commissioner.jpg"
                  alt="In-game commissioner dashboard showing league phase (Spring Training), advance week controls, and quick action menu"
                  className="w-full h-auto block"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── REAL DATA BANNER ────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-border bg-card/20">
          <div className="container mx-auto max-w-4xl">
            <p className="font-pixel text-gold/60 text-[9px] text-center tracking-widest mb-10">BUILT ON REAL DATA</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
              {[
                { num: "130+", label: "Programs", sub: "All major conferences" },
                { num: "3,500+", label: "Real Players", sub: "2026 rosters" },
                { num: "43+", label: "Tracked Stats", sub: "Including Statcast" },
                { num: "13", label: "Conferences", sub: "SEC to HBCU" },
              ].map((stat) => (
                <div key={stat.label} className="bg-background p-8 text-center">
                  <div className="font-pixel text-gold text-2xl sm:text-3xl mb-1">{stat.num}</div>
                  <div className="font-pixel text-[10px] text-foreground mb-1">{stat.label}</div>
                  <div className="text-muted-foreground text-xs">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── COACH SYSTEM STRIP ──────────────────────────────── */}
        <section className="py-16 px-4 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 04</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">Coach Progression</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Your coach earns XP each season and levels up through four skill trees — Scouting, Evaluation, Pitching Recruiting, and Hitting Recruiting. Higher skills unlock bonuses and badges.
                </p>
              </div>
              <div className="border border-border bg-card/40 p-5">
                <div className="font-pixel text-[8px] text-gold/50 mb-4 tracking-widest">SKILL TREES</div>
                <CoachSkillsPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE: OFFSEASON PIPELINE ─────────────────────── */}
        <section className="py-20 px-4 border-t border-border bg-card/30">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 05</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">Full Offseason Pipeline</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  The offseason is just as competitive as the season. Every player departure triggers a cascade — transfer portal, JUCO development, MLB Draft projections, walk-on signings, and a brand-new recruiting class all happen in sequence. Roster management never stops.
                </p>
                <ul className="space-y-3">
                  {[
                    "Transfer portal opens — players enter and you can recruit them directly",
                    "Unsigned portal players sign with JUCO and return next year with an OVR boost",
                    "Top departing seniors and juniors projected into a 3-round MLB Draft",
                    "Cuts & Walk-Ons phase: trim rosters to 25 and sign unsigned recruits",
                    "New 80-recruit class generates at season start — the cycle begins again",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="order-1 md:order-2 space-y-4">
                <div className="border border-border bg-card/60 overflow-hidden">
                  <img
                    src="/screenshots/walkons.jpg"
                    alt="In-game Cuts and Walk-Ons page showing current roster panel and walk-on pool with position filters"
                    className="w-full h-auto block"
                  />
                </div>
                <OffseasonPipelineVisual />
              </div>
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ──────────────────────────────────────── */}
        <section className="py-24 px-4 border-t border-border relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #d4a843 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
          <div className="container mx-auto text-center relative z-10 max-w-2xl">
            <div className="flex justify-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-4 h-4 text-gold fill-gold" />
              ))}
            </div>
            <h2 className="font-pixel text-gold text-2xl sm:text-3xl leading-relaxed mb-5">
              Ready to Build<br />Your Legacy?
            </h2>
            <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
              Join leagues and compete against real coaches in the most immersive college baseball dynasty experience available.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <RetroButton size="lg" className="px-12" data-testid="button-join-now">
                  Create Your Account
                </RetroButton>
              </Link>
              <Link href="/guest">
                <RetroButton variant="outline" size="lg" className="px-12">
                  Explore as Guest
                </RetroButton>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10 px-4 bg-card/30">
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DynastyLogo className="w-8 h-8" />
              <div>
                <div className="font-pixel text-gold text-[10px]">パワプロ College Baseball Dynasty</div>
                <div className="text-muted-foreground text-xs">A league-first dynasty simulator</div>
              </div>
            </div>
            <div className="flex gap-6 text-xs text-muted-foreground font-pixel">
              <Link href="/register" className="hover:text-gold transition-colors">Sign Up</Link>
              <Link href="/guest" className="hover:text-gold transition-colors">Guest Mode</Link>
              <a href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Donate</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── GAME PREVIEW TERMINAL ─────────────────────────────────────

const DEMO_PHASES = [
  { label: "SCOUTING REVEAL", sub: "Uncover hidden recruit ratings", context: "RECRUITING · SEASON 1 · WEEK 2", img: "/screenshots/recruiting.jpg", alt: "Recruiting board with fog-of-war scouting, position filters, and stage-view buttons" },
  { label: "PHONE CALL", sub: "Build interest with your top targets", context: "RECRUITING · SEASON 1 · WEEK 3", img: "/screenshots/recruiting.jpg", alt: "Recruiting board showing interest tracking, watchlist, and weekly action limits" },
  { label: "CAMPUS VISIT", sub: "Show off your facilities to top recruits", context: "RECRUITING · SEASON 1 · WEEK 5", img: "/screenshots/recruiting.jpg", alt: "Recruiting pipeline with campus visit stage and contested-recruit filter" },
  { label: "SCHOLARSHIP OFFER", sub: "Close the deal with NIL money", context: "RECRUITING · SEASON 1 · WEEK 7", img: "/screenshots/recruiting.jpg", alt: "Recruiting board showing scholarship offer actions and commit tracking" },
  { label: "REGULAR SEASON", sub: "Simulate games and track standings", context: "REGULAR SEASON · SEASON 1 · WEEK 1", img: "/screenshots/commissioner.jpg", alt: "Commissioner dashboard showing Spring Training phase, Advance Week button, and Quick Actions menu" },
  { label: "POWER RANKINGS", sub: "Composite scores updated every week", context: "REGULAR SEASON · SEASON 1 · WEEK 8", img: "/screenshots/rankings.jpg", alt: "In-game power rankings table showing team grades, week-over-week trends, and composite scores" },
  { label: "PLAYER PROFILE", sub: "Deep stats on every player on your roster", context: "REGULAR SEASON · SEASON 1 · WEEK 6", img: "/screenshots/player-card.jpg", alt: "In-game player profile card showing attributes, special ability badges, and career season stats" },
  { label: "COLLEGE WORLD SERIES", sub: "Seeded double-elimination bracket for the title", context: "POSTSEASON · SEASON 1 · CWS", img: "/screenshots/postseason.jpg", alt: "College World Series bracket view showing Super Regionals results, CWS Bracket A and B with winners/losers matchups, seeded teams, and CWS BOUND advancement tags" },
  { label: "CUTS & WALK-ONS", sub: "Trim your roster and sign walk-ons", context: "OFFSEASON · SEASON 1 · CUTS PHASE", img: "/screenshots/walkons.jpg", alt: "Cuts and Walk-Ons offseason phase showing Current Roster panel and Walk-On Pool with position filters" },
];

const PHASE_DURATION = 3200;

function GamePreviewTerminal() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false);
      timeout = setTimeout(() => {
        setPhaseIndex((i) => (i + 1) % DEMO_PHASES.length);
        setVisible(true);
      }, 300);
    }, PHASE_DURATION);
    return () => {
      clearInterval(cycle);
      clearTimeout(timeout);
    };
  }, []);

  const phase = DEMO_PHASES[phaseIndex];

  return (
    <div className="border-2 border-gold/20 bg-card/60" style={{ boxShadow: "0 0 40px rgba(212,168,67,0.08)" }}>
      {/* Chrome bar — context label synced to active phase */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/15 bg-black/30">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span
          className="font-pixel text-[8px] text-gold/40 ml-2 tracking-widest transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {phase.context}
        </span>
      </div>
      {/* Screenshot cycling */}
      <div className="relative overflow-hidden">
        <img
          key={phase.img + phaseIndex}
          src={phase.img}
          alt={phase.alt}
          className="w-full h-auto block"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.28s ease",
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-black/70 border-b border-gold/20"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(-6px)",
            transition: "opacity 0.28s ease, transform 0.28s ease",
          }}
        >
          <span className="font-pixel text-[9px] text-gold tracking-widest">{phase.label}</span>
          <span className="text-[9px] text-muted-foreground hidden sm:inline">—</span>
          <span className="text-[9px] text-muted-foreground hidden sm:inline">{phase.sub}</span>
          <div className="ml-auto flex gap-1">
            {DEMO_PHASES.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${i === phaseIndex ? "w-5 bg-gold" : "w-1.5 bg-gold/25"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OFFSEASON PIPELINE VISUAL ─────────────────────────────────

function OffseasonPipelineVisual() {
  const steps = [
    {
      icon: GitMerge,
      color: "text-purple-400",
      border: "border-purple-400/30",
      bg: "bg-purple-400/5",
      label: "Transfer Portal",
      sub: "Players enter — recruit them directly",
    },
    {
      icon: TrendingUp,
      color: "text-cyan-400",
      border: "border-cyan-400/30",
      bg: "bg-cyan-400/5",
      label: "JUCO Development",
      sub: "Unsigned players return with +5–15 OVR boost",
    },
    {
      icon: Trophy,
      color: "text-amber-400",
      border: "border-amber-400/30",
      bg: "bg-amber-400/5",
      label: "MLB Draft",
      sub: "Top departing players projected Rounds 1–3",
    },
    {
      icon: ClipboardList,
      color: "text-green-400",
      border: "border-green-400/30",
      bg: "bg-green-400/5",
      label: "Cuts & Walk-Ons",
      sub: "Trim to 25 — sign unsigned recruits",
    },
    {
      icon: BarChart3,
      color: "text-gold",
      border: "border-gold/30",
      bg: "bg-gold/5",
      label: "New Recruiting Class",
      sub: "80 fresh recruits — the cycle begins again",
    },
  ];
  return (
    <div className="border border-border bg-card/60 p-5 space-y-1">
      <div className="font-pixel text-[8px] text-gold/50 mb-4 tracking-widest">OFFSEASON SEQUENCE</div>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className={`flex items-center gap-3 p-3 border ${s.border} ${s.bg}`}>
            <div className={`shrink-0 ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-pixel text-[9px] ${s.color} tracking-wide`}>{s.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{s.sub}</div>
            </div>
            <div className="font-pixel text-[9px] text-muted-foreground/40 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex justify-start pl-5">
              <ArrowRight className="w-3 h-3 text-gold/20 rotate-90" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CoachSkillsPreview() {
  const trees = [
    { icon: Search, name: "Scouting", color: "text-blue-400", borderColor: "border-blue-400/30", level: 3, max: 5, desc: "+Scout actions/wk" },
    { icon: Eye, name: "Evaluation", color: "text-purple-400", borderColor: "border-purple-400/30", level: 4, max: 5, desc: "+Reveal accuracy" },
    { icon: Zap, name: "Pitching", color: "text-green-400", borderColor: "border-green-400/30", level: 2, max: 5, desc: "+Interest gain" },
    { icon: Swords, name: "Hitting", color: "text-orange-400", borderColor: "border-orange-400/30", level: 2, max: 5, desc: "+Offer bonus" },
  ];
  return (
    <div className="space-y-3">
      {trees.map((t) => (
        <div key={t.name} className="flex items-center gap-3">
          <div className={`p-1.5 border ${t.borderColor} ${t.color} shrink-0`}>
            <t.icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="font-pixel text-[9px] text-foreground">{t.name}</span>
              <span className="text-[8px] text-muted-foreground">{t.desc}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: t.max }).map((_, i) => (
                <div key={i} className={`flex-1 h-2 rounded-sm ${i < t.level ? "bg-gold" : "bg-border/30"}`} />
              ))}
            </div>
          </div>
          <span className="font-pixel text-[9px] text-gold w-8 text-right">Lv {t.level}</span>
        </div>
      ))}
      <div className="pt-2 border-t border-border/30 flex justify-between text-[8px] font-pixel text-muted-foreground">
        <span>Coach Level 12</span>
        <span className="text-gold">340 / 500 XP</span>
      </div>
    </div>
  );
}

// ── FEEDBACK MODAL ────────────────────────────────────────────

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !details) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    toast({ title: "Feedback submitted! Thank you for your input." });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border-2 border-border max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <RetroButton variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4 text-muted-foreground" data-testid="button-close-feedback">
          <X className="w-5 h-5" />
        </RetroButton>

        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-6 h-6 text-gold" />
          <h2 className="font-pixel text-gold text-sm">Submit Feedback</h2>
        </div>

        <p className="text-muted-foreground text-sm mb-6">
          Report a bug, request a feature, or share your feedback.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Topic <span className="text-red-400">*</span>
            </label>
            <RetroSelect
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              options={[
                { value: "", label: "Select a topic" },
                { value: "bug", label: "Bug Report" },
                { value: "feature", label: "Feature Request" },
                { value: "feedback", label: "General Feedback" },
                { value: "question", label: "Question" },
              ]}
            />
          </div>

          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Details <span className="text-red-400">*</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe your bug, feature request, or feedback..."
              className="w-full h-24 bg-card border-2 border-border text-foreground p-3 text-sm resize-none focus:border-gold focus:outline-none"
              data-testid="input-feedback-details"
            />
          </div>

          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Your Name (optional)
            </label>
            <RetroInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              data-testid="input-feedback-name"
            />
          </div>

          <RetroButton type="submit" className="w-full" data-testid="button-submit-feedback">
            Submit Feedback
          </RetroButton>
        </form>
      </div>
    </div>
  );
}
