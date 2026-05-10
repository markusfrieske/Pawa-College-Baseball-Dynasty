import { Link } from "wouter";
import { useState } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import {
  Trophy, Users, Target, Star, TrendingUp, User, Bug, Layers, LogOut,
  DollarSign, X, GraduationCap, Building2, Search, Settings, Binoculars,
  Crown, Eye, Zap, Swords, ClipboardList, UserPlus, ChevronRight, Flame,
  Shield, CalendarDays
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
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: "linear-gradient(#d4a843 1px, transparent 1px), linear-gradient(90deg, #d4a843 1px, transparent 1px)", backgroundSize: "48px 48px" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80 pointer-events-none" />

          <div className="container mx-auto text-center relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 border border-gold/30 bg-gold/5 px-4 py-1.5 mb-8 text-gold/80 text-[10px] font-pixel tracking-wider">
              <span className="text-gold">◆</span> SEASON 2026 · OPEN BETA <span className="text-gold">◆</span>
            </div>

            <div className="flex justify-center gap-1.5 mb-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-5 h-5 text-gold fill-gold animate-pulse" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>

            <h1 className="font-pixel text-gold leading-tight mb-6" style={{ fontSize: "clamp(1.8rem, 6vw, 3.5rem)" }}>
              College<br />Baseball<br />Dynasty
            </h1>

            <p className="text-foreground/70 text-lg leading-relaxed max-w-xl mx-auto mb-8">
              The most immersive college baseball management sim. Recruit real talent, build your program, and compete against other coaches in a persistent league.
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {["130+ Programs", "3,500+ Real Players", "13 Conferences", "20-Season Dynasties", "Multiplayer Leagues"].map((pill) => (
                <span key={pill} className="border border-gold/25 bg-gold/5 text-gold/70 text-[9px] font-pixel px-3 py-1.5 tracking-wide">
                  {pill}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Link href="/register">
                <RetroButton size="lg" className="w-full sm:w-auto px-10" data-testid="button-get-started">
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
              <Link href={isLoggedIn ? "/manage-rosters" : "/login"}>
                <RetroButton variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-manage-rosters">
                  <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Manage Rosters
                </RetroButton>
              </Link>
              <Link href={isLoggedIn ? "/manage-recruiting" : "/login"}>
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
            <div className="border-2 border-gold/20 bg-card/60" style={{ boxShadow: "0 0 40px rgba(212,168,67,0.08)" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gold/15 bg-black/30">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                <span className="font-pixel text-[8px] text-gold/40 ml-2 tracking-widest">RECRUITING · SEASON 1 · WEEK 4</span>
              </div>
              <div className="p-5">
                <RecruitingPreview />
              </div>
            </div>
            <p className="text-center text-[10px] font-pixel text-muted-foreground/50 mt-3 tracking-wider">
              REAL PLAYERS · FOG OF WAR SCOUTING · INTEREST TRACKING
            </p>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────────── */}
        <section className="py-16 px-4 border-t border-border">
          <div className="container mx-auto max-w-4xl">
            <h2 className="font-pixel text-gold text-center text-lg mb-12">How It Works</h2>
            <div className="grid sm:grid-cols-3 gap-px bg-border">
              {[
                { step: "01", icon: <Crown className="w-7 h-7" />, title: "Create Your League", desc: "Set up a dynasty with 4-16 teams across real conferences. Invite friends or fill slots with CPU opponents." },
                { step: "02", icon: <Binoculars className="w-7 h-7" />, title: "Scout & Recruit", desc: "80 recruits per class with hidden ratings. Spend actions on visits, phone calls, and NIL offers to land top talent." },
                { step: "03", icon: <Trophy className="w-7 h-7" />, title: "Compete & Advance", desc: "Simulate games weekly, track standings, win Conference Championships and the College World Series." },
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
                    "80 recruits per class with star-distribution fog of war",
                    "Blue Chips, Gems, and Busts hidden in every class",
                    "State-based proximity bonuses shape your recruiting territory",
                    "CPU teams compete against you using the same action system",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border bg-card/40 p-4">
                <div className="font-pixel text-[8px] text-gold/50 mb-3 tracking-widest">RECRUIT PIPELINE</div>
                <PipelinePreview />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE: PLAYER PROFILES ────────────────────────── */}
        <section className="py-20 px-4 border-t border-border bg-card/30">
          <div className="container mx-auto max-w-5xl">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 border border-border bg-card/60 p-4">
                <div className="font-pixel text-[8px] text-gold/50 mb-3 tracking-widest">PLAYER PROFILE</div>
                <PlayerCardPreview />
              </div>
              <div className="order-1 md:order-2">
                <div className="font-pixel text-[9px] text-gold/60 tracking-widest mb-3">FEATURE 02</div>
                <h2 className="font-pixel text-gold text-xl leading-relaxed mb-5">Deep Player Systems</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Every player carries 22 numeric attributes, letter grades across 8 common skills, and up to 7 special ability badges. Real 2026 rosters for all 13 conferences — 3,500+ actual players.
                </p>
                <ul className="space-y-3">
                  {[
                    "150-650 overall scale translates to 1-5 star ratings",
                    "Gold, Blue, and Red special ability tiers",
                    "Sophomore progression and eligibility tracking each season",
                    "MLB Draft projections for departing seniors and juniors",
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
                  Designed for multiplayer from the ground up. Compete against other coaches in a persistent dynasty where every recruiting decision, every week advance, and every championship win is recorded forever.
                </p>
                <ul className="space-y-3">
                  {[
                    "Conference Championships, Super Regionals, and College World Series",
                    "Power Rankings updated with composite scores each week",
                    "Commissioner tools: deadlines, bulk editing, audit logs",
                    "Transfer portal and JUCO pipelines between seasons",
                  ].map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-border bg-card/40 p-4">
                <div className="font-pixel text-[8px] text-gold/50 mb-3 tracking-widest">POWER RANKINGS · WEEK 6</div>
                <RankingsPreview />
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
                { num: "13", label: "Conferences", sub: "SEC to HBCU" },
                { num: "20", label: "Max Seasons", sub: "Per dynasty" },
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

// ── INLINE MOCKUP COMPONENTS ─────────────────────────────────

function StarRow({ count, filled }: { count: number; filled: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className={`w-2.5 h-2.5 ${i < filled ? "text-gold fill-gold" : "text-border"}`} />
      ))}
    </div>
  );
}

function RecruitingPreview() {
  const recruits = [
    { name: "J. Martinez", pos: "RHP", stars: 5, state: "TX", interest: 71, ovr: "521", fogged: false, tag: "BLUE CHIP", tagColor: "text-blue-300 border-blue-400/40" },
    { name: "C. Williams", pos: "OF", stars: 4, state: "FL", interest: 48, ovr: "437", fogged: false, tag: null, tagColor: "" },
    { name: "T. Johnson", pos: "SS", stars: 4, state: "CA", interest: 33, ovr: "???", fogged: true, tag: null, tagColor: "" },
    { name: "M. Davis", pos: "C", stars: 3, state: "GA", interest: 62, ovr: "???", fogged: true, tag: "GEM?", tagColor: "text-amber-300 border-amber-400/40" },
    { name: "B. Thompson", pos: "1B", stars: 3, state: "NC", interest: 19, ovr: "???", fogged: true, tag: null, tagColor: "" },
    { name: "R. Garcia", pos: "LHP", stars: 2, state: "AZ", interest: 44, ovr: "???", fogged: true, tag: null, tagColor: "" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-pixel text-gold text-[10px] tracking-wide">RECRUITS · 80 TOTAL</span>
        <div className="flex gap-3 text-[9px] font-pixel text-muted-foreground">
          <span className="text-green-400">6 SCOUTED</span>
          <span>74 HIDDEN</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 font-pixel text-[8px] text-muted-foreground">
              <th className="text-left pb-2 pr-3">Player</th>
              <th className="text-center pb-2 px-2">Pos</th>
              <th className="text-center pb-2 px-2">Stars</th>
              <th className="text-center pb-2 px-2 hidden sm:table-cell">OVR</th>
              <th className="text-right pb-2 pl-2">Interest</th>
            </tr>
          </thead>
          <tbody>
            {recruits.map((r) => (
              <tr key={r.name} className="border-b border-border/20 hover:bg-gold/5 transition-colors">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{r.name}</span>
                        {r.tag && (
                          <span className={`text-[7px] font-pixel border px-1 py-0.5 ${r.tagColor}`}>{r.tag}</span>
                        )}
                      </div>
                      <div className="text-[9px] text-muted-foreground">{r.state}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <span className="text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground font-pixel">{r.pos}</span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  <StarRow count={5} filled={r.stars} />
                </td>
                <td className="py-2.5 px-2 text-center hidden sm:table-cell">
                  <span className={r.fogged ? "text-muted-foreground/40 font-pixel text-[9px]" : "text-foreground font-medium"}>{r.ovr}</span>
                </td>
                <td className="py-2.5 pl-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-14 bg-border/20 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${r.interest}%` }} />
                    </div>
                    <span className="text-[9px] text-gold font-pixel w-6 text-right">{r.interest}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 pt-3 border-t border-border/30 flex gap-4 text-[8px] font-pixel text-muted-foreground/60">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Blue Chip</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Gem Candidate</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-border inline-block" /> Unknown OVR</span>
      </div>
    </div>
  );
}

function PipelinePreview() {
  const stages = [
    { label: "Aware", count: 12, color: "bg-muted-foreground/30" },
    { label: "Interested", count: 8, color: "bg-blue-500/50" },
    { label: "Considering", count: 5, color: "bg-purple-500/50" },
    { label: "Very Interested", count: 3, color: "bg-amber-500/50" },
    { label: "Committed", count: 1, color: "bg-green-500/70" },
  ];
  const max = 12;
  return (
    <div className="space-y-2.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="font-pixel text-[8px] text-muted-foreground w-24 shrink-0">{s.label}</span>
          <div className="flex-1 bg-border/20 h-3 rounded-sm overflow-hidden">
            <div className={`h-full ${s.color} rounded-sm transition-all`} style={{ width: `${(s.count / max) * 100}%` }} />
          </div>
          <span className="font-pixel text-[9px] text-gold w-3 text-right">{s.count}</span>
        </div>
      ))}
      <div className="pt-2 border-t border-border/30 flex justify-between text-[8px] font-pixel text-muted-foreground">
        <span>29 total contacts</span>
        <span className="text-green-400">1 committed</span>
      </div>
    </div>
  );
}

function PlayerCardPreview() {
  const attrs = [
    { name: "Velocity", val: 91, max: 99 },
    { name: "Stuff", val: 86, max: 99 },
    { name: "Control", val: 78, max: 99 },
    { name: "Stamina", val: 82, max: 99 },
  ];
  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-pixel text-gold text-xs mb-0.5">Jake Martinez</div>
          <div className="text-[9px] text-muted-foreground">RHP · Junior · Tennessee</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StarRow count={5} filled={5} />
          <span className="font-pixel text-[9px] text-gold border border-gold/30 px-1.5">521 OVR</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {attrs.map((a) => (
          <div key={a.name} className="flex items-center gap-2">
            <span className="font-pixel text-[8px] text-muted-foreground w-14 shrink-0">{a.name}</span>
            <div className="flex-1 bg-border/20 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: `${(a.val / a.max) * 100}%` }} />
            </div>
            <span className="font-pixel text-[9px] text-gold w-4 text-right">{a.val}</span>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <div className="font-pixel text-[8px] text-muted-foreground mb-2">SPECIAL ABILITIES</div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[7px] font-pixel bg-amber-900/40 text-amber-300 border border-amber-500/30 px-1.5 py-0.5">ELITE ARM</span>
          <span className="text-[7px] font-pixel bg-blue-900/30 text-blue-300 border border-blue-500/25 px-1.5 py-0.5">STRIKEOUT ARTIST</span>
          <span className="text-[7px] font-pixel bg-blue-900/30 text-blue-300 border border-blue-500/25 px-1.5 py-0.5">WORKHORSE</span>
          <span className="text-[7px] font-pixel bg-red-900/30 text-red-300 border border-red-500/25 px-1.5 py-0.5">SLOW STARTER</span>
        </div>
      </div>

      <div className="border-t border-border/40 pt-3">
        <div className="font-pixel text-[8px] text-muted-foreground mb-2">COMMON GRADES</div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { name: "Arm", grade: "A+" },
            { name: "Poise", grade: "A" },
            { name: "Fielding", grade: "B+" },
            { name: "Clutch", grade: "B" },
          ].map((g) => (
            <div key={g.name} className="text-center">
              <div className={`font-pixel text-sm ${g.grade.startsWith("A") ? "text-green-400" : "text-blue-400"}`}>{g.grade}</div>
              <div className="text-[7px] text-muted-foreground font-pixel">{g.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RankingsPreview() {
  const teams = [
    { rank: 1, name: "Tennessee", abbr: "UT", score: "A+", comp: 94, color: "#FF8200", trend: "▲" },
    { rank: 2, name: "Texas", abbr: "TX", score: "A", comp: 88, color: "#BF5700", trend: "▲" },
    { rank: 3, name: "Florida", abbr: "FL", score: "A", comp: 85, color: "#0021A5", trend: "—" },
    { rank: 4, name: "Vanderbilt", abbr: "VU", score: "B+", comp: 79, color: "#866D4B", trend: "▼" },
    { rank: 5, name: "LSU", abbr: "LS", score: "B+", comp: 76, color: "#461D7C", trend: "▲" },
    { rank: 6, name: "Arkansas", abbr: "AR", score: "B", comp: 71, color: "#9D2235", trend: "—" },
  ];
  return (
    <div className="space-y-1">
      {teams.map((t) => (
        <div key={t.rank} className="flex items-center gap-3 py-1.5 border-b border-border/20 hover:bg-gold/5 transition-colors">
          <span className="font-pixel text-[9px] text-muted-foreground w-5 text-center">#{t.rank}</span>
          <div className="w-6 h-6 flex items-center justify-center text-[8px] font-pixel text-white font-bold shrink-0" style={{ backgroundColor: t.color }}>
            {t.abbr}
          </div>
          <span className="flex-1 text-xs font-medium text-foreground">{t.name}</span>
          <span className={`text-[8px] font-pixel ${t.trend === "▲" ? "text-green-400" : t.trend === "▼" ? "text-red-400" : "text-muted-foreground"}`}>{t.trend}</span>
          <span className={`font-pixel text-sm font-bold ${t.score.startsWith("A") ? "text-green-400" : "text-blue-400"}`}>{t.score}</span>
          <span className="text-[9px] text-muted-foreground w-6 text-right">{t.comp}</span>
        </div>
      ))}
      <div className="pt-2 text-[8px] font-pixel text-muted-foreground/50 text-center">
        Roster OVR · Pitching · Hitting · Recruiting
      </div>
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
