import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import {
  Trophy, Star, User, Bug, Layers, LogOut,
  DollarSign, X, Search, Binoculars,
  Crown, Eye, Zap, Swords, ClipboardList, UserPlus, ChevronRight,
  ArrowRight, GitMerge, TrendingUp, BarChart3,
  Shield, Users, Database, ChevronDown, Wand2,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePresence } from "@/hooks/use-presence";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DynastyLogo } from "@/components/dynasty-logo";

const CONFERENCES = [
  "SEC", "ACC", "Big Ten", "Big 12", "Pac-12", "AAC",
  "Sun Belt", "WCC", "Big West", "Missouri Valley", "Ivy League", "HBCU",
];

export default function LandingPage() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: onlineData } = useQuery<{ online: number }>({
    queryKey: ["/api/presence/online-count"],
    refetchInterval: 30_000,
  });

  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: leagues, isLoading: leaguesLoading } = useQuery<Array<{ id: string; name: string; commissionerId: string; currentPhase: string }>>({
    queryKey: ["/api/leagues"],
    enabled: !!user,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Signed out successfully" });
    },
  });

  const isLoggedIn = !!user;

  // Find a league where this user is commissioner (wizard works for any phase)
  const wizardEligibleLeague = leagues?.find(
    l => l.commissionerId === user?.id
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── TICKER CSS ───────────────────────────────────────── */}
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 28s linear infinite;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────── */}
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
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="relative min-h-[90vh] flex items-center overflow-hidden">
          {/* Layer 1 — Chibi hero image (base, behind everything) */}
          <div className="absolute inset-0 z-0 pointer-events-none select-none">
            <img
              src="/chibi-hero.png"
              alt="College Baseball Dynasty chibi baseball players"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>

          {/* Layer 2 — Dark scrim (dims image for text legibility) */}
          <div className="absolute inset-0 z-[1] bg-black/45 pointer-events-none" />

          {/* Layer 3 — Pixel grid overlay */}
          <div
            className="absolute inset-0 z-[2] opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(#d4a843 1px, transparent 1px), linear-gradient(90deg, #d4a843 1px, transparent 1px)", backgroundSize: "48px 48px" }}
          />
          {/* Layer 3 — Gold radial bloom */}
          <div
            className="absolute inset-0 z-[2] pointer-events-none"
            style={{ background: "radial-gradient(ellipse 70% 60% at 35% 50%, rgba(196,163,90,0.10) 0%, transparent 65%)" }}
          />
          {/* Layer 3 — Bottom fade into page background */}
          <div className="absolute bottom-0 left-0 right-0 h-32 z-[2] bg-gradient-to-t from-background to-transparent pointer-events-none" />

          {/* Left content */}
          <div className="relative z-10 container mx-auto px-6 sm:px-10 py-20">
            {/* No backdrop box — text legibility via shadow/stroke */}
            <div className="max-w-xl">
              {/* Season badge + Users Online */}
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <div
                  className="inline-flex items-center gap-2 border border-gold/30 bg-gold/5 px-4 py-1.5 text-gold/80 text-[10px] font-pixel tracking-wider"
                  style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
                >
                  <span className="text-gold">◆</span> SEASON 2026 · OPEN BETA <span className="text-gold">◆</span>
                </div>
                {onlineData !== undefined && (
                  <div
                    className="inline-flex items-center gap-2 border border-green-500/30 bg-green-900/20 px-3 py-1.5 text-[10px] font-pixel tracking-wider"
                    style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
                    data-testid="badge-users-online"
                  >
                    <span
                      className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
                      style={{ boxShadow: "0 0 6px rgba(74,222,128,0.8)" }}
                    />
                    <span className="text-green-400">{onlineData.online} ONLINE</span>
                  </div>
                )}
              </div>

              {/* Large editorial headline */}
              <h1
                className="font-pixel text-gold leading-none mb-8"
                style={{
                  fontSize: "clamp(2.2rem, 6vw, 4.5rem)",
                  textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 4px 32px rgba(0,0,0,0.8), 0 0 40px rgba(196,163,90,0.35)",
                  WebkitTextStroke: "1px rgba(0,0,0,0.6)",
                }}
              >
                College
                <br />
                <span className="ml-4 sm:ml-8">Baseball</span>
                <br />
                Dynasty
              </h1>

              <p
                className="text-white/90 text-lg leading-relaxed max-w-md mb-10"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.95), 0 2px 20px rgba(0,0,0,0.85)" }}
              >
                The most immersive college baseball management sim. Recruit real talent, build your program, and compete against real coaches in a persistent league.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href="/register">
                  <RetroButton variant="shimmer" size="lg" className="w-full sm:w-auto px-10 flex items-center gap-2" data-testid="button-get-started">
                    Start Your Dynasty <ArrowRight className="w-4 h-4" />
                  </RetroButton>
                </Link>
                <Link href="/guest">
                  <RetroButton variant="outline" size="lg" className="w-full sm:w-auto px-10" data-testid="button-guest-mode">
                    Try as Guest
                  </RetroButton>
                </Link>
              </div>

              {/* Quick access links */}
              <div
                className="flex flex-wrap gap-4 text-xs text-white/70"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
              >
                <Link href="/roster-viewer">
                  <button className="flex items-center gap-1.5 hover:text-gold transition-colors font-medium" data-testid="button-view-ncaa-rosters">
                    <Database className="w-3.5 h-3.5 text-gold" /> View NCAA 2026 Rosters
                  </button>
                </Link>
                <Link href={isLoggedIn ? "/manage-rosters" : "/guest?redirect=/manage-rosters"}>
                  <button className="flex items-center gap-1 hover:text-gold transition-colors" data-testid="button-manage-rosters">
                    <ClipboardList className="w-3.5 h-3.5" /> Manage Custom Rosters
                  </button>
                </Link>
                {isLoggedIn && leaguesLoading && !leagues ? (
                  <button className="flex items-center gap-1 text-muted-foreground cursor-wait" disabled data-testid="button-open-recruiting-wizard-loading">
                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    Create Recruiting Class
                  </button>
                ) : wizardEligibleLeague ? (
                  <button
                    className="flex items-center gap-1 hover:text-gold transition-colors"
                    onClick={() => setLocation(`/manage-recruiting?leagueId=${wizardEligibleLeague.id}`)}
                    data-testid="button-open-recruiting-wizard"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-gold" /> Create Recruiting Class
                  </button>
                ) : (
                  <Link href={isLoggedIn ? "/manage-recruiting" : "/guest?redirect=/manage-recruiting"}>
                    <button className="flex items-center gap-1 hover:text-gold transition-colors" data-testid="button-manage-recruiting">
                      <UserPlus className="w-3.5 h-3.5" /> Create Recruiting Class
                    </button>
                  </Link>
                )}
              </div>
            </div>

            {/* Floating stat card — lower left */}
            <div className="absolute bottom-12 left-6 sm:left-10 hidden 2xl:block">
              <div className="bg-card/90 border border-gold/20 backdrop-blur-sm px-5 py-4 rounded-sm shadow-xl">
                <div className="font-pixel text-gold text-2xl mb-0.5">130+</div>
                <div className="text-xs text-muted-foreground font-pixel">Real Programs</div>
                <div className="flex gap-1 mt-2">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-2.5 h-2.5 fill-gold text-gold" />)}
                </div>
              </div>
            </div>

            {/* Floating feature badge — right side overlay */}
            <div className="absolute top-1/4 right-6 sm:right-10 hidden xl:block z-20">
              <div className="bg-card/90 border border-border/60 backdrop-blur-sm px-4 py-3 rounded-sm shadow-xl max-w-[180px]">
                <div className="font-pixel text-[8px] text-gold/60 tracking-widest mb-2">3,500+ REAL PLAYERS</div>
                <div className="text-[10px] text-muted-foreground leading-snug">Authentic 2026 rosters from all 12 conferences</div>
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-muted-foreground/40 animate-bounce">
            <ChevronDown className="w-4 h-4" />
          </div>
        </section>

        {/* ── CONFERENCE TICKER ────────────────────────────────── */}
        <div className="border-y border-border bg-card/30 py-3 overflow-hidden">
          <div className="ticker-track">
            {[...CONFERENCES, ...CONFERENCES].map((conf, i) => (
              <span key={i} className="flex items-center gap-4 px-4 font-pixel text-[9px] text-muted-foreground/50 tracking-widest whitespace-nowrap">
                {conf}
                <span className="text-gold/30">◆</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── WHY COLLEGE BASEBALL DYNASTY ────────────────────── */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <p className="font-pixel text-[9px] text-gold/50 tracking-widest mb-3">WHY COLLEGE BASEBALL DYNASTY</p>
              <h2 className="font-pixel text-gold text-xl sm:text-2xl leading-relaxed">Built for the Long Game</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  icon: <Database className="w-6 h-6" />,
                  title: "Real Rosters, Real Stakes",
                  desc: "3,500+ actual 2026 players across 130+ programs. Authentic attributes, handedness, special ability badges, and career histories — not procedurally generated stats.",
                },
                {
                  icon: <Binoculars className="w-6 h-6" />,
                  title: "Fog-of-War Recruiting",
                  desc: "Every recruit starts hidden. Scout progressively to reveal ratings. A 3-star might be a generational gem — or a generational bust. You won't know until you dig.",
                },
                {
                  icon: <Shield className="w-6 h-6" />,
                  title: "League-First Competition",
                  desc: "Built for multiplayer. Commissioner tools, phase deadlines, audit logs, and stall detection keep leagues running for seasons on end. Every decision is permanent history.",
                },
              ].map((card) => (
                <div key={card.title} className="bg-card/50 border border-border/60 rounded-sm p-7 flex flex-col gap-4 hover:border-gold/20 transition-colors">
                  <div className="text-gold">{card.icon}</div>
                  <h3 className="font-pixel text-[11px] text-foreground leading-relaxed">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TWO-COLUMN IMAGE CARDS ───────────────────────────── */}
        <section className="py-4 px-6 pb-20">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Card 1 — Recruiting Pipeline */}
              <div className="relative rounded-sm overflow-hidden border border-border/60 group bg-card/40">
                <img
                  src="/screenshots/pipeline.jpg"
                  alt="Fog-of-war recruiting pipeline"
                  className="w-full h-64 object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6">
                  <p className="font-pixel text-[9px] text-gold/60 tracking-widest mb-2">RECRUITING</p>
                  <h3 className="font-pixel text-gold text-sm leading-relaxed mb-3">Scout in the Dark.<br/>Sign the Best.</h3>
                  <Link href="/register">
                    <span className="text-xs text-gold/70 hover:text-gold transition-colors flex items-center gap-1">
                      Get Started <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
              </div>
              {/* Card 2 — Player Systems */}
              <div className="relative rounded-sm overflow-hidden border border-border/60 group bg-card/40">
                <img
                  src="/screenshots/player-card.jpg"
                  alt="Deep player profile systems"
                  className="w-full h-64 object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                {/* Floating stat badge */}
                <div className="absolute top-4 right-4 bg-gold text-background font-pixel text-[8px] px-3 py-1.5 rounded-sm">
                  3,500+ Real Players
                </div>
                <div className="absolute bottom-0 left-0 p-6">
                  <p className="font-pixel text-[9px] text-gold/60 tracking-widest mb-2">PLAYER SYSTEMS</p>
                  <h3 className="font-pixel text-gold text-sm leading-relaxed mb-3">22 Attributes.<br/>43+ Tracked Stats.</h3>
                  <Link href="/register">
                    <span className="text-xs text-gold/70 hover:text-gold transition-colors flex items-center gap-1">
                      Build Your Roster <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── REAL RESULTS THUMBNAIL ROW ───────────────────────── */}
        <section className="py-16 px-6 border-t border-border bg-card/20">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <p className="font-pixel text-[9px] text-gold/50 tracking-widest mb-3">SEE IT IN ACTION</p>
              <h2 className="font-pixel text-gold text-lg sm:text-xl leading-relaxed">Real Results, Real Competition</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { img: "/screenshots/pipeline.jpg", label: "Fog-of-War Recruiting", desc: "Progressive scouting reveals true talent" },
                { img: "/screenshots/player-card.jpg", label: "Deep Player Systems", desc: "22 attributes, ability badges, career stats" },
                { img: "/screenshots/commissioner.jpg", label: "League Competition", desc: "Commissioner tools, postseason brackets" },
              ].map((card) => (
                <div key={card.label} className="relative rounded-sm overflow-hidden border border-border/50 group bg-card/40">
                  <img
                    src={card.img}
                    alt={card.label}
                    className="w-full h-44 object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3">
                    <div className="bg-background/80 border border-border/60 p-1.5 rounded-sm">
                      <ArrowRight className="w-3 h-3 text-gold/60" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 p-4">
                    <div className="font-pixel text-[9px] text-gold mb-1">{card.label}</div>
                    <div className="text-[10px] text-muted-foreground">{card.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHY COACHES CHOOSE US ────────────────────────────── */}
        <section className="py-16 px-6 border-t border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <p className="font-pixel text-[9px] text-gold/50 tracking-widest mb-3">WHY COACHES CHOOSE US</p>
              <h2 className="font-pixel text-gold text-lg sm:text-xl leading-relaxed">Everything a Dynasty Needs</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { icon: <Users className="w-6 h-6" />, num: "130+", label: "Real Programs", desc: "All major conferences from SEC to HBCU — real schools with authentic prestige, facilities, and NIL budgets." },
                { icon: <Database className="w-6 h-6" />, num: "22", label: "Tracked Attributes", desc: "Power, speed, contact, velocity, control, fielding, and more — each influencing sim outcomes and recruiting value." },
                { icon: <BarChart3 className="w-6 h-6" />, num: "43+", label: "Season Stats", desc: "Traditional, advanced, and Statcast metrics including wOBA, wRC+, BABIP, SIERA, exit velocity, barrel%, and OAA." },
              ].map((tile) => (
                <div key={tile.label} className="flex flex-col gap-3 p-6 bg-card/40 border border-border/50 rounded-sm hover:border-gold/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="text-gold">{tile.icon}</div>
                    <div>
                      <div className="font-pixel text-gold text-xl">{tile.num}</div>
                      <div className="font-pixel text-[9px] text-foreground tracking-wide">{tile.label}</div>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{tile.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURE DEEP-DIVES ───────────────────────────────── */}
        <section className="py-20 px-6 border-t border-border bg-card/20">
          <div className="container mx-auto max-w-5xl space-y-20">

            {/* Recruiting */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 01</div>
                <h2 className="font-pixel text-gold text-lg leading-relaxed mb-5">Fog-of-War Recruiting</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">Every recruit starts hidden. Spend scouting actions to progressively reveal their true overall rating, attributes, and special abilities. A 3-star recruit might be a generational gem in disguise.</p>
                <ul className="space-y-3">
                  {[
                    "Recruit class scales to league size (30–80) — Blue Chips, Gems, and Busts hidden in every class",
                    "Scouting progressively narrows ratings from unknown ranges to exact values",
                    "Per-recruit weekly action limits enforce real recruiting strategy",
                    "Priority color-coding shows which school factors each recruit cares about",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/pipeline.jpg" alt="Recruit pipeline" className="w-full h-auto block" />
              </div>
            </div>

            {/* Player Systems */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/player-card.jpg" alt="Player profile card" className="w-full h-auto block" />
              </div>
              <div className="order-1 md:order-2">
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 02</div>
                <h2 className="font-pixel text-gold text-lg leading-relaxed mb-5">Deep Player Systems</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">Every player carries 22 numeric attributes, letter grades across 8 common skills, and up to 7 special ability badges. Real 2026 rosters for all 12 conferences — 3,500+ actual players.</p>
                <ul className="space-y-3">
                  {[
                    "150–650 overall scale translates to 1–5 star ratings",
                    "Gold, Blue, and Red special ability badge tiers with 0–7 per player",
                    "Advanced stats: wOBA, wRC+, BABIP, SIERA, exit velocity, barrel%, OAA",
                    "MLB Draft projections for departing seniors and declared juniors",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Competition */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 03</div>
                <h2 className="font-pixel text-gold text-lg leading-relaxed mb-5">League-First Competition</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">Designed for multiplayer from the ground up. Every recruiting decision, week advance, and championship win is permanent dynasty history. The commissioner system keeps leagues moving.</p>
                <ul className="space-y-3">
                  {[
                    "Conference Championships, Super Regionals, and College World Series postseason",
                    "Power Rankings with composite scores and week-over-week trend tracking",
                    "Commissioner tools: phase deadlines, bulk roster editing, stall detection, audit logs",
                    "Invite links for easy multiplayer onboarding — no email verification required",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/commissioner.jpg" alt="Commissioner dashboard" className="w-full h-auto block" />
              </div>
            </div>

          </div>
        </section>

        {/* ── STATS BANNER ─────────────────────────────────────── */}
        <section className="py-16 px-6 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <p className="font-pixel text-gold/50 text-[9px] text-center tracking-widest mb-10">BUILT ON REAL DATA</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { num: "130+", label: "Programs", sub: "All major conferences" },
                { num: "3,500+", label: "Real Players", sub: "2026 rosters" },
                { num: "43+", label: "Tracked Stats", sub: "Including Statcast" },
                { num: "12", label: "Conferences", sub: "SEC to HBCU" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card/40 border border-border/50 rounded-sm p-6 text-center hover:border-gold/20 transition-colors">
                  <div className="font-pixel text-gold text-2xl sm:text-3xl mb-1">{stat.num}</div>
                  <div className="font-pixel text-[10px] text-foreground mb-1">{stat.label}</div>
                  <div className="text-muted-foreground text-xs">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ───────────────────────────────────────── */}
        <section className="py-24 px-6 border-t border-border relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #d4a843 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(196,163,90,0.06) 0%, transparent 70%)" }} />
          <div className="container mx-auto text-center relative z-10 max-w-2xl">
            <div className="flex justify-center gap-1 mb-6">
              {[1,2,3,4,5].map((i) => <Star key={i} className="w-4 h-4 text-gold fill-gold" />)}
            </div>
            <h2 className="font-pixel text-gold text-2xl sm:text-3xl leading-relaxed mb-5">
              Ready to Build<br />Your Legacy?
            </h2>
            <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
              Join leagues and compete against real coaches in the most immersive college baseball dynasty experience available.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <RetroButton size="lg" className="px-12 flex items-center gap-2" data-testid="button-join-now">
                  Create Your Account <ArrowRight className="w-4 h-4" />
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

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <footer className="border-t border-border bg-card/30 pt-16 pb-8 px-6 relative overflow-hidden">
          {/* Watermark */}
          <div className="absolute bottom-0 left-0 right-0 text-center pointer-events-none select-none overflow-hidden">
            <div className="font-pixel text-[clamp(1.5rem,6vw,4rem)] text-gold/[0.025] leading-none whitespace-nowrap pb-2">
              College Baseball Dynasty
            </div>
          </div>

          <div className="container mx-auto max-w-5xl relative z-10">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-10 mb-12">
              {/* Brand column */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <DynastyLogo className="w-8 h-8" />
                  <span className="font-pixel text-gold text-[10px]">パワプロ</span>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  The league-first college baseball dynasty simulator. Build your program. Compete forever.
                </p>
                <a href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com" target="_blank" rel="noopener noreferrer" className="text-xs text-gold/50 hover:text-gold transition-colors font-pixel">
                  Support the Project ◆
                </a>
              </div>

              {/* Quick Links */}
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-4">QUICK LINKS</div>
                <ul className="space-y-3">
                  {[
                    { label: "My Dynasties", href: "/dashboard" },
                    { label: "Create League", href: "/create-league" },
                    { label: "Manage Custom Rosters", href: "/manage-rosters" },
                    { label: "Sign In", href: "/login" },
                    { label: "Create Account", href: "/register" },
                  ].map((link) => (
                    <li key={link.label}>
                      <Link href={link.href}>
                        <span className="text-sm text-muted-foreground hover:text-gold transition-colors">{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Conferences */}
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-4">CONFERENCES</div>
                <ul className="space-y-2">
                  {CONFERENCES.slice(0, 7).map((c) => (
                    <li key={c} className="text-sm text-muted-foreground/60">{c}</li>
                  ))}
                  <li className="text-sm text-muted-foreground/40">+ {CONFERENCES.length - 7} more</li>
                </ul>
              </div>

              {/* Stay in the Loop */}
              <div>
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-4">STAY IN THE LOOP</div>
                <p className="text-sm text-muted-foreground mb-4">Get updates on new features and season releases.</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    className="flex-1 bg-background border border-border/60 text-sm text-foreground px-3 py-2 rounded-sm focus:outline-none focus:border-gold/40 placeholder:text-muted-foreground/30"
                  />
                  <button className="border border-gold/30 text-gold/70 hover:text-gold hover:border-gold/60 transition-colors px-3 py-2 rounded-sm text-sm">
                    →
                  </button>
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <RetroButton variant="ghost" size="sm" onClick={() => setShowFeedbackModal(true)} className="text-muted-foreground text-xs" data-testid="button-footer-feedback">
                    <Bug className="w-3.5 h-3.5 mr-1.5" /> Submit Feedback
                  </RetroButton>
                </div>
              </div>
            </div>

            {/* Footer bottom bar */}
            <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="font-pixel text-[8px] text-muted-foreground/40 tracking-widest">
                © 2026 COLLEGE BASEBALL DYNASTY · OPEN BETA
              </div>
              <div className="flex gap-4">
                <span className="font-pixel text-[8px] text-gold/30 tracking-widest">◆ SEASON 2026</span>
                <span className="font-pixel text-[8px] text-gold/30 tracking-widest">◆ 130+ PROGRAMS</span>
                <span className="font-pixel text-[8px] text-gold/30 tracking-widest">◆ 12 CONFERENCES</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}


// ── GAME PREVIEW TERMINAL (kept for potential reuse) ──────────
const DEMO_PHASES = [
  { label: "RECRUITING", context: "dynasty.recruiting", img: "/screenshots/pipeline.jpg", alt: "Recruit pipeline", sub: "Scout prospects across the country" },
  { label: "PLAYER CARDS", context: "dynasty.roster", img: "/screenshots/player-card.jpg", alt: "Player card", sub: "Deep player attributes and abilities" },
  { label: "COMMISSIONER", context: "dynasty.league", img: "/screenshots/commissioner.jpg", alt: "Commissioner", sub: "League management and phase control" },
  { label: "RANKINGS", context: "dynasty.rankings", img: "/screenshots/rankings.jpg", alt: "Power Rankings", sub: "Week-over-week competitive tracking" },
];
function GamePreviewTerminal() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const phase = DEMO_PHASES[phaseIndex];
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhaseIndex((i) => (i + 1) % DEMO_PHASES.length);
        setVisible(true);
      }, 300);
    }, 4500);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="border border-gold/20 bg-black/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/15 bg-black/30">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="font-pixel text-[8px] text-gold/40 ml-2 tracking-widest" style={{ opacity: visible ? 1 : 0 }}>
          {phase.context}
        </span>
      </div>
      <div className="relative overflow-hidden">
        <img key={phase.img + phaseIndex} src={phase.img} alt={phase.alt} className="w-full h-auto block" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.28s ease" }} />
        <div className="absolute top-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-black/70 border-b border-gold/20" style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(-6px)", transition: "opacity 0.28s ease, transform 0.28s ease" }}>
          <span className="font-pixel text-[9px] text-gold tracking-widest">{phase.label}</span>
          <span className="text-[9px] text-muted-foreground hidden sm:inline">—</span>
          <span className="text-[9px] text-muted-foreground hidden sm:inline">{phase.sub}</span>
          <div className="ml-auto flex gap-1">
            {DEMO_PHASES.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === phaseIndex ? "w-5 bg-gold" : "w-1.5 bg-gold/25"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OFFSEASON PIPELINE VISUAL (kept for potential reuse) ──────
function OffseasonPipelineVisual() {
  const steps = [
    { icon: GitMerge, color: "text-purple-400", border: "border-purple-400/30", bg: "bg-purple-400/5", label: "Transfer Portal", sub: "Players enter — recruit them directly" },
    { icon: TrendingUp, color: "text-cyan-400", border: "border-cyan-400/30", bg: "bg-cyan-400/5", label: "JUCO Development", sub: "Unsigned players return with +5–15 OVR boost" },
    { icon: Trophy, color: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/5", label: "MLB Draft", sub: "Top departing players projected Rounds 1–3" },
    { icon: ClipboardList, color: "text-green-400", border: "border-green-400/30", bg: "bg-green-400/5", label: "Cuts & Walk-Ons", sub: "Trim to 25 — sign unsigned recruits" },
    { icon: BarChart3, color: "text-gold", border: "border-gold/30", bg: "bg-gold/5", label: "New Recruiting Class", sub: "80 fresh recruits — the cycle begins again" },
  ];
  return (
    <div className="border border-border bg-card/60 p-5 space-y-1">
      <div className="font-pixel text-[8px] text-gold/50 mb-4 tracking-widest">OFFSEASON SEQUENCE</div>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className={`flex items-center gap-3 p-3 border ${s.border} ${s.bg}`}>
            <div className={`shrink-0 ${s.color}`}><s.icon className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <div className={`font-pixel text-[9px] ${s.color} tracking-wide`}>{s.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{s.sub}</div>
            </div>
            <div className="font-pixel text-[9px] text-muted-foreground/40 shrink-0">{String(i + 1).padStart(2, "0")}</div>
          </div>
          {i < steps.length - 1 && <div className="flex justify-start pl-5"><ArrowRight className="w-3 h-3 text-gold/20 rotate-90" /></div>}
        </div>
      ))}
    </div>
  );
}

// ── COACH SKILLS PREVIEW (kept for potential reuse) ───────────
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
          <div className={`p-1.5 border ${t.borderColor} ${t.color} shrink-0`}><t.icon className="w-3.5 h-3.5" /></div>
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
        <p className="text-muted-foreground text-sm mb-6">Report a bug, request a feature, or share your feedback.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">Topic <span className="text-red-400">*</span></label>
            <RetroSelect value={topic} onChange={(e) => setTopic(e.target.value)} options={[
              { value: "", label: "Select a topic" },
              { value: "bug", label: "Bug Report" },
              { value: "feature", label: "Feature Request" },
              { value: "feedback", label: "General Feedback" },
              { value: "question", label: "Question" },
            ]} />
          </div>
          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">Details <span className="text-red-400">*</span></label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe your bug, feature request, or feedback..." className="w-full h-24 bg-card border-2 border-border text-foreground p-3 text-sm resize-none focus:border-gold focus:outline-none" data-testid="input-feedback-details" />
          </div>
          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">Your Name (optional)</label>
            <RetroInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" data-testid="input-feedback-name" />
          </div>
          <RetroButton type="submit" className="w-full" data-testid="button-submit-feedback">Submit Feedback</RetroButton>
        </form>
      </div>
    </div>
  );
}
