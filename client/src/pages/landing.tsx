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
  Gamepad2, FileText, CheckSquare, Radio, BarChart2,
  Globe, Settings,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DynastyLogo } from "@/components/dynasty-logo";

const TICKER_ITEMS = [
  { tag: "FINAL", color: "text-green-400", text: "Oklahoma 6, North Carolina 4" },
  { tag: "REPORT PENDING", color: "text-amber-400", text: "LSU vs Texas A&M" },
  { tag: "COMMITMENT", color: "text-blue-400", text: "4-star SS chooses Coastal Carolina" },
  { tag: "UPSET ALERT", color: "text-red-400", text: "#18 Oregon State falls in extras" },
  { tag: "ADVANCE READY", color: "text-gold", text: "11/14 coaches locked in" },
  { tag: "STORYLINE", color: "text-purple-400", text: "Summer showcase stock rising" },
  { tag: "FINAL", color: "text-green-400", text: "Arkansas 3, Florida 2 (12)" },
  { tag: "COMMITMENT", color: "text-blue-400", text: "3-star LHP returns from JUCO" },
  { tag: "REPORT PENDING", color: "text-amber-400", text: "Vanderbilt vs Kentucky" },
  { tag: "STORYLINE", color: "text-purple-400", text: "Transfer portal opens — 3 players enter" },
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

  const wizardEligibleLeague = leagues?.find(l => l.commissionerId === user?.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 40s linear infinite;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="border-b border-border sticky top-0 z-40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 pr-14 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DynastyLogo className="w-10 h-10" />
            <span className="text-gold text-sm hidden sm:block">
              パワプロ College Baseball Dynasty
            </span>
          </div>

          {isLoggedIn ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 text-gold" data-testid="display-user">
                <User className="w-5 h-5" />
                <span className="text-xs font-semibold sm:text-xs hidden sm:block truncate max-w-[100px]">
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
          <div className="absolute inset-0 z-0 pointer-events-none select-none">
            <img
              src="/chibi-hero.png"
              alt="College Baseball Dynasty chibi baseball players"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>
          <div className="absolute inset-0 z-[1] bg-black/50 pointer-events-none" />
          <div
            className="absolute inset-0 z-[2] opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(#d4a843 1px, transparent 1px), linear-gradient(90deg, #d4a843 1px, transparent 1px)", backgroundSize: "48px 48px" }}
          />
          <div
            className="absolute inset-0 z-[2] pointer-events-none"
            style={{ background: "radial-gradient(ellipse 70% 60% at 35% 50%, rgba(196,163,90,0.10) 0%, transparent 65%)" }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-32 z-[2] bg-gradient-to-t from-background to-transparent pointer-events-none" />

          <div className="relative z-10 container mx-auto px-6 sm:px-10 py-20">
            <div className="max-w-xl">
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <div
                  className="inline-flex items-center gap-2 border border-gold/30 bg-gold/5 px-4 py-1.5 text-gold/80 text-xs tracking-wider"
                  style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
                >
                  <span className="text-gold">◆</span> SEASON 2026 <span className="text-gold">◆</span>
                </div>
                {onlineData !== undefined && (
                  <div
                    className="inline-flex items-center gap-2 border border-green-500/30 bg-green-900/20 px-3 py-1.5 text-xs tracking-wider"
                    style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
                    data-testid="badge-users-online"
                  >
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: "0 0 6px rgba(74,222,128,0.8)" }} />
                    <span className="text-green-400">USERS ONLINE: {onlineData.online}</span>
                  </div>
                )}
              </div>

              <h1
                className="font-brand-pixel text-gold leading-tight mb-6"
                style={{
                  fontSize: "clamp(1.6rem, 4.5vw, 3.5rem)",
                  textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 4px 32px rgba(0,0,0,0.8), 0 0 40px rgba(196,163,90,0.35)",
                }}
              >
                College Baseball<br />
                <span className="ml-4 sm:ml-6">Dynasty</span>
              </h1>

              <div
                className="text-white/90 text-lg leading-relaxed max-w-md mb-10"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.95), 0 2px 20px rgba(0,0,0,0.85)" }}
              >
                <p className="hidden sm:block mb-3">
                  Build a solo or multiplayer college baseball dynasty with 3,700+ players across 149 schools. Recruit every week, manage your roster, simulate or report your series, track stats and standings, and chase the College World Series across 20 seasons.
                </p>
                <p className="hidden sm:block">
                  Run a full 149-team dynasty with all 12 conferences, or build a custom multiplayer league with the schools and rules your group wants. Recruiting, schedules, box scores, standings, postseason history, and league management all live in one place.
                </p>
                <p className="sm:hidden">
                  Build a college baseball dynasty with 3,700+ players across 149 schools. Recruit, manage your roster, and chase the College World Series.
                </p>
              </div>

              <p
                className="hidden sm:block text-gold/60 text-xs tracking-widest mb-5"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
              >
                Recruit the future. Run the league. Chase Omaha.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Link href="/league/create?mode=full_season">
                  <RetroButton variant="shimmer" size="lg" className="w-full sm:w-auto px-8 flex items-center gap-2" data-testid="button-full-season">
                    Full Season Dynasty <ArrowRight className="w-4 h-4" />
                  </RetroButton>
                </Link>
                <Link href="/league/create?mode=custom">
                  <RetroButton variant="outline" size="lg" className="w-full sm:w-auto px-8 flex items-center gap-2" data-testid="button-custom-league">
                    Custom Multiplayer <Users className="w-4 h-4" />
                  </RetroButton>
                </Link>
              </div>
              <div className="flex flex-wrap gap-4 text-white/60 text-xs mb-8"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
              >
                <span className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-gold/60" /> All 12 confs · 149 teams · 56-game season</span>
                <span className="flex items-center gap-1.5"><Settings className="w-3 h-3 text-gold/60" /> Custom: pick conferences, teams &amp; length</span>
              </div>

              <div
                className="flex flex-wrap gap-4 text-xs text-white/70"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95)" }}
              >
                <Link href="/guest">
                  <button className="flex items-center gap-1.5 hover:text-gold transition-colors" data-testid="button-guest-league">
                    <Database className="w-3.5 h-3.5" /> Guest League
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
                <a href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-gold transition-colors" data-testid="button-donate">
                  <DollarSign className="w-3.5 h-3.5" /> Donate
                </a>
              </div>
            </div>

          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-muted-foreground/40 animate-bounce">
            <ChevronDown className="w-4 h-4" />
          </div>
        </section>

        {/* ── LIVE LEAGUE TICKER ───────────────────────────────── */}
        <div className="border-y border-border bg-card/30 py-3 overflow-hidden">
          <div className="ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="flex items-center gap-3 px-6 whitespace-nowrap">
                <span className={`text-xs font-semibold tracking-widest ${item.color}`}>{item.tag}</span>
                <span className="text-xs text-muted-foreground/70">{item.text}</span>
                <span className="text-gold/20">◆</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── YOUR WEEK IN THE DYNASTY ─────────────────────────── */}
        <section className="py-20 px-6 border-b border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">HOW IT WORKS</p>
              <h2 className="text-gold text-xl sm:text-2xl leading-relaxed mb-4">Your Week in the Dynasty</h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Every advance creates a new set of decisions. Check your matchup, scout your board, play your games, submit results, and lock in when your program is ready.
              </p>
            </div>

            <div className="grid sm:grid-cols-5 gap-4 relative">
              {[
                {
                  num: "01",
                  icon: <Radio className="w-6 h-6" />,
                  label: "League Hub",
                  desc: "See your opponent, league pulse, open tasks, and ready status.",
                },
                {
                  num: "02",
                  icon: <Binoculars className="w-6 h-6" />,
                  label: "Recruiting",
                  desc: "Spend weekly actions on scouting, pitches, battles, and storylines.",
                },
                {
                  num: "03",
                  icon: <Gamepad2 className="w-6 h-6" />,
                  label: "Simulate or Play",
                  desc: "Let the sim engine run your games automatically, or play them yourself and report the result.",
                },
                {
                  num: "04",
                  icon: <FileText className="w-6 h-6" />,
                  label: "Report the Box Score",
                  desc: "Upload screenshots or enter the final line score, batting, and pitching stats.",
                },
                {
                  num: "05",
                  icon: <CheckSquare className="w-6 h-6" />,
                  label: "Advance Safely",
                  desc: "Commissioner reviews readiness, disputes, and save states before moving forward.",
                },
              ].map((step, i) => (
                <div key={step.num} className="relative flex flex-col gap-3 p-5 bg-card/40 border border-border/50 rounded-sm hover:border-gold/30 transition-colors">
                  <div className="text-xs font-semibold text-gold/30 tracking-widest">{step.num}</div>
                  <div className="text-gold">{step.icon}</div>
                  <div className="text-xs font-semibold text-foreground leading-relaxed">{step.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                  {i < 4 && (
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex">
                      <ArrowRight className="w-4 h-4 text-gold/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SCREENSHOT FEATURE SHOWCASE ──────────────────────── */}
        <section className="py-20 px-6 border-b border-border bg-card/20">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">BUILT AROUND THE LEAGUE NIGHT RITUAL</p>
              <h2 className="text-gold text-xl sm:text-2xl leading-relaxed mb-4">The Weekly Home Base</h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                This is not just a roster database. It is the live command center every coach in your dynasty returns to every week.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  img: "/screenshots/recruiting.jpg",
                  tag: "RECRUITING COCKPIT",
                  title: "Scout Uncertain Prospects",
                  desc: "Scouting, storylines, showcases, and weekly battles shape what each player becomes.",
                  href: "/register",
                  cta: "Start Recruiting",
                },
                {
                  img: "/screenshots/pipeline.jpg",
                  tag: "PIPELINE BOARD",
                  title: "Manage Your Board",
                  desc: "Track interest, priorities, and competing offers across your entire class in one view.",
                  href: "/register",
                  cta: "Build Your Class",
                },
                {
                  img: "/screenshots/commissioner.jpg",
                  tag: "COMMISSIONER SAFETY",
                  title: "Advance With Confidence",
                  desc: "Readiness tracking, pending reports, audit logs, and save-state snapshots before every advance.",
                  href: "/register",
                  cta: "Run the League",
                },
                {
                  img: "/screenshots/rankings.jpg",
                  tag: "LEAGUE PULSE",
                  title: "Stats, Records, and History",
                  desc: "Power rankings, leaderboards, postseason brackets, and dynasty records that build season after season.",
                  href: "/register",
                  cta: "See the League",
                },
              ].map((card) => (
                <div key={card.tag} className="relative rounded-sm overflow-hidden border border-border/60 group bg-card/40">
                  <img
                    src={card.img}
                    alt={card.title}
                    className="w-full h-56 object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6">
                    <p className="text-xs font-semibold text-gold/60 tracking-widest mb-2">{card.tag}</p>
                    <h3 className="text-gold text-sm leading-relaxed mb-2">{card.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 max-w-[280px]">{card.desc}</p>
                    <Link href={card.href}>
                      <span className="text-xs text-gold/70 hover:text-gold transition-colors flex items-center gap-1">
                        {card.cta} <ArrowRight className="w-3 h-3" />
                      </span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── RECRUITING AND STORYLINES ────────────────────────── */}
        <section className="py-20 px-6 border-b border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">RECRUITING</p>
                <h2 className="text-gold text-xl leading-relaxed mb-5">Recruiting That Feels Like a Game</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Prospects are not solved on day one. Storylines, scouting, showcases, injuries, position changes, and coach choices shape what each player becomes over time.
                </p>
                <ul className="space-y-3">
                  {[
                    "Hidden ratings reveal progressively through scouting and events",
                    "Recruiting battles update across the league each week",
                    "Players can rise, fall, change positions, or leave the pool",
                    "Classes carry long-term consequences into future seasons",
                    "Some players rise, some fade, and some change paths before signing day",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/pipeline.jpg" alt="Fog-of-war recruiting pipeline" className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </section>

        {/* ── GAME REPORTING ───────────────────────────────────── */}
        <section className="py-20 px-6 border-b border-border bg-card/20">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/postseason.jpg" alt="Game reporting and box score" className="w-full h-auto block" />
              </div>
              <div className="order-1 md:order-2">
                <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">GAME REPORTING</p>
                <h2 className="text-gold text-xl leading-relaxed mb-5">Connect the Field to the League</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Auto-sim your games instantly, or play them yourself and bring the result back into the dynasty. Reports become standings, player stats, records, and storylines.
                </p>
                <ul className="space-y-3">
                  {[
                    "Line score and full box score entry",
                    "Screenshot evidence for league transparency",
                    "OCR-assisted stat capture from uploaded screenshots",
                    "Commissioner review for disputed results",
                    "Stats flow into leaderboards, player pages, and dynasty history",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── COMMISSIONER SAFETY ──────────────────────────────── */}
        <section className="py-20 px-6 border-b border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">COMMISSIONER TOOLS</p>
                <h2 className="text-gold text-xl leading-relaxed mb-5">Advance Without Fear</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Multiplayer leagues need trust. Commissioners can see who is ready, what is missing, what changed, and whether a rollback point exists before advancing.
                </p>
                <ul className="space-y-3">
                  {[
                    "Ready-up tracking across all coaches",
                    "Pending report and dispute review before advance",
                    "Full advance audit trail and history",
                    "Save-state snapshots and rollback confidence",
                    "Co-commissioner support for shared authority",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/commissioner.jpg" alt="Commissioner safety tools" className="w-full h-auto block" />
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS AND HISTORY ────────────────────────────────── */}
        <section className="py-20 px-6 border-b border-border bg-card/20">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 border border-border/60 rounded-sm overflow-hidden">
                <img src="/screenshots/rankings.jpg" alt="Stats and league history" className="w-full h-auto block" />
              </div>
              <div className="order-1 md:order-2">
                <p className="text-xs font-semibold text-gold/50 tracking-widest mb-3">STATS AND HISTORY</p>
                <h2 className="text-gold text-xl leading-relaxed mb-5">Every Week Becomes History</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Standings, leaders, player cards, records, postseason runs, and recruiting classes build a league story that lasts season after season.
                </p>
                <ul className="space-y-3">
                  {[
                    "Team and player stat tracking with 43+ fields",
                    "Power rankings with composite scores and trends",
                    "Season awards: MVP, Pitcher of Year, Freshman of Year",
                    "Postseason brackets — Conference Champs, Super Regionals, CWS",
                    "Dynasty history timeline spanning all past seasons",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />{pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── DATA BANNER ───────────────────────────────────────── */}
        <section className="py-14 px-6 border-b border-border">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { num: "130+", label: "Real Programs", sub: "All major conferences" },
                { num: "3,500+", label: "Real Players", sub: "Authentic 2026 rosters" },
                { num: "43+", label: "Tracked Stats", sub: "Traditional + Statcast" },
                { num: "12", label: "Conferences", sub: "SEC to HBCU" },
              ].map((stat) => (
                <div key={stat.label} className="bg-card/40 border border-border/50 rounded-sm p-6 text-center hover:border-gold/20 transition-colors">
                  <div className="text-gold text-2xl sm:text-3xl mb-1">{stat.num}</div>
                  <div className="text-xs font-semibold text-foreground mb-1">{stat.label}</div>
                  <div className="text-muted-foreground text-xs">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────── */}
        <section className="py-24 px-6 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #d4a843 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(196,163,90,0.06) 0%, transparent 70%)" }} />
          <div className="container mx-auto text-center relative z-10 max-w-2xl">
            <div className="flex justify-center gap-1 mb-6">
              {[1,2,3,4,5].map((i) => <Star key={i} className="w-4 h-4 text-gold fill-gold" />)}
            </div>
            <h2 className="text-gold text-2xl sm:text-3xl leading-relaxed mb-5">
              Start the League Your<br />Group Keeps Talking About
            </h2>
            <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
              Create a dynasty, invite coaches, play your games, and let the app handle the league office.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
              <Link href="/league/create?mode=full_season">
                <RetroButton size="lg" className="px-10 flex items-center gap-2" data-testid="button-cta-full-season">
                  Full Season Dynasty <Globe className="w-4 h-4" />
                </RetroButton>
              </Link>
              <Link href="/league/create?mode=custom">
                <RetroButton variant="outline" size="lg" className="px-10 flex items-center gap-2" data-testid="button-cta-custom">
                  Custom Multiplayer <Users className="w-4 h-4" />
                </RetroButton>
              </Link>
              <Link href="/guest">
                <RetroButton variant="ghost" size="lg" className="px-10" data-testid="button-explore-demo">
                  Explore Demo
                </RetroButton>
              </Link>
            </div>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <footer className="border-t border-border bg-card/30 pt-16 pb-8 px-6 relative overflow-hidden">
          <div className="absolute bottom-0 left-0 right-0 text-center pointer-events-none select-none overflow-hidden">
            <div className="text-[clamp(1.5rem,6vw,4rem)] text-gold/[0.025] leading-none whitespace-nowrap pb-2">
              College Baseball Dynasty
            </div>
          </div>

          <div className="container mx-auto max-w-5xl relative z-10">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-10 mb-12">
              {/* Brand column */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <DynastyLogo className="w-8 h-8" />
                  <span className="text-gold text-xs">パワプロ</span>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  The online league office for solo and multiplayer college baseball dynasties.
                </p>
                <a href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com" target="_blank" rel="noopener noreferrer" className="text-xs text-gold/40 hover:text-gold/70 transition-colors">
                  Support the Project ◆
                </a>
              </div>

              {/* Quick Links */}
              <div>
                <div className="text-xs font-semibold text-gold/60 tracking-widest mb-4">QUICK LINKS</div>
                <ul className="space-y-3">
                  {[
                    { label: "My Dynasties", href: "/dashboard" },
                    { label: "Create League", href: "/league/create" },
                    { label: "Browse Rosters", href: "/roster-viewer" },
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
                <div className="text-xs font-semibold text-gold/60 tracking-widest mb-4">CONFERENCES</div>
                <ul className="space-y-2">
                  {["SEC", "ACC", "Big Ten", "Big 12", "Pac-12", "AAC", "Sun Belt"].map((c) => (
                    <li key={c} className="text-sm text-muted-foreground/60">{c}</li>
                  ))}
                  <li className="text-sm text-muted-foreground/40">+ 5 more</li>
                </ul>
              </div>

              {/* Get Involved */}
              <div>
                <div className="text-xs font-semibold text-gold/60 tracking-widest mb-4">GET INVOLVED</div>
                <ul className="space-y-3">
                  <li>
                    <RetroButton variant="ghost" size="sm" onClick={() => setShowFeedbackModal(true)} className="text-muted-foreground text-xs px-0 justify-start" data-testid="button-footer-feedback">
                      <Bug className="w-3.5 h-3.5 mr-1.5" /> Submit Feedback
                    </RetroButton>
                  </li>
                  <li>
                    <Link href="/register">
                      <span className="text-sm text-muted-foreground hover:text-gold transition-colors">Join the Beta</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/guest">
                      <span className="text-sm text-muted-foreground hover:text-gold transition-colors">Explore as Guest</span>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-semibold text-muted-foreground/40 tracking-widest">
                © 2026 COLLEGE BASEBALL DYNASTY · OPEN BETA
              </div>
              <div className="flex gap-4">
                <span className="text-xs font-semibold text-gold/30 tracking-widest">◆ SEASON 2026</span>
                <span className="text-xs font-semibold text-gold/30 tracking-widest">◆ 130+ PROGRAMS</span>
                <span className="text-xs font-semibold text-gold/30 tracking-widest">◆ 12 CONFERENCES</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
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
          <h2 className="text-gold text-sm">Submit Feedback</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-6">Report a bug, request a feature, or share your feedback.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Topic <span className="text-red-400">*</span></label>
            <RetroSelect value={topic} onChange={(e) => setTopic(e.target.value)} options={[
              { value: "", label: "Select a topic" },
              { value: "bug", label: "Bug Report" },
              { value: "feature", label: "Feature Request" },
              { value: "feedback", label: "General Feedback" },
              { value: "question", label: "Question" },
            ]} />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Details <span className="text-red-400">*</span></label>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe your bug, feature request, or feedback..." className="w-full h-24 bg-card border-2 border-border text-foreground p-3 text-sm resize-none focus:border-gold focus:outline-none" data-testid="input-feedback-details" />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Your Name (optional)</label>
            <RetroInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" data-testid="input-feedback-name" />
          </div>
          <RetroButton type="submit" className="w-full" data-testid="button-submit-feedback">Submit Feedback</RetroButton>
        </form>
      </div>
    </div>
  );
}
