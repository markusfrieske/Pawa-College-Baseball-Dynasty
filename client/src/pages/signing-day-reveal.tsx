import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { RecruitCard } from "@/components/recruit-card";
import type { RevealRecruit } from "@/components/recruit-card";
import { ArrowLeft, Download, Trophy } from "lucide-react";

interface TeamEntry {
  team: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    conference?: string;
    prestige: number;
    isCpu: boolean;
  };
  recruits: RevealRecruit[];
}

interface RevealData {
  league: { id: string; name: string; currentSeason: number };
  teamData: TeamEntry[];
  myTeamId: string | null;
  allTeams: {
    id: string;
    name: string;
    abbreviation: string;
    primaryColor: string;
    secondaryColor: string;
    isCpu: boolean;
  }[];
}

function getClassScore(recruits: RevealRecruit[]): number {
  if (!recruits.length) return 0;
  const avg = recruits.reduce((s, r) => s + r.overall, 0) / recruits.length;
  const avgStars = recruits.reduce((s, r) => s + r.starRating, 0) / recruits.length;
  const fiveStars = recruits.filter(r => r.starRating === 5).length;
  const fourStars = recruits.filter(r => r.starRating >= 4).length;
  return (avgStars * 20) + (avg / 50) + (fiveStars * 15) + (fourStars * 5) + (recruits.length * 3);
}

function getClassRank(allTeams: TeamEntry[], targetTeamId: string): number {
  const sorted = [...allTeams]
    .filter(t => t.recruits.length > 0)
    .sort((a, b) => getClassScore(b.recruits) - getClassScore(a.recruits));
  const idx = sorted.findIndex(t => t.team.id === targetTeamId);
  return idx >= 0 ? idx + 1 : 0;
}

// ── useReducedMotion ──────────────────────────────────────────
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
  });
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handle = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener("change", handle);
      return () => mq.removeEventListener("change", handle);
    } catch {}
  }, []);
  return reduced;
}

// ── StadiumBackground ─────────────────────────────────────────
// Pixel art top-down baseball diamond rendered in SVG.
// Excluded from html2canvas because it lives outside cardGridRef.
function StadiumBackground({ isBuildup }: { isBuildup: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      data-testid="stadium-background"
      // Opacity is controlled here (not on the SVG) so sdStadiumRumble can modulate it directly.
      style={
        isBuildup
          ? { animation: "sdStadiumRumble 1.5s ease-in-out forwards" }
          : { opacity: 0.16 }
      }
    >
      <svg
        viewBox="0 0 800 680"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        shapeRendering="crispEdges"
      >
        {/* Dark base field */}
        <rect x="0" y="0" width="800" height="680" fill="#060e06" />

        {/* Outfield grass oval */}
        <ellipse cx="400" cy="370" rx="368" ry="305" fill="#0b1a0b" />

        {/* Warning track */}
        <ellipse cx="400" cy="370" rx="368" ry="305" fill="none" stroke="#1e1006" strokeWidth="30" />

        {/* Inner grass */}
        <ellipse cx="400" cy="370" rx="338" ry="275" fill="#0d1e0d" />

        {/* Infield dirt circle */}
        <circle cx="400" cy="420" r="158" fill="#1c0f06" />

        {/* Infield grass diamond cutout */}
        <polygon points="400,278 512,420 400,532 288,420" fill="#0d1e0d" />

        {/* Pitcher's mound */}
        <circle cx="400" cy="415" r="22" fill="#221208" />
        <circle cx="400" cy="415" r="8" fill="#2a1610" />

        {/* Base paths (dirt strips) */}
        <line x1="400" y1="532" x2="512" y2="420" stroke="#1c1008" strokeWidth="14" />
        <line x1="512" y1="420" x2="400" y2="278" stroke="#1c1008" strokeWidth="14" />
        <line x1="400" y1="278" x2="288" y2="420" stroke="#1c1008" strokeWidth="14" />
        <line x1="288" y1="420" x2="400" y2="532" stroke="#1c1008" strokeWidth="14" />

        {/* Bases */}
        <rect x="502" y="410" width="20" height="20" fill="#181818" />
        <rect x="390" y="268" width="20" height="20" fill="#181818" />
        <rect x="278" y="410" width="20" height="20" fill="#181818" />

        {/* Home plate */}
        <polygon points="400,522 416,538 416,552 384,552 384,538" fill="#181818" />

        {/* Batter boxes outlines */}
        <rect x="372" y="534" width="16" height="28" fill="none" stroke="#141408" strokeWidth="2" />
        <rect x="412" y="534" width="16" height="28" fill="none" stroke="#141408" strokeWidth="2" />

        {/* Foul lines */}
        <line x1="400" y1="532" x2="42" y2="80" stroke="#161606" strokeWidth="4" strokeDasharray="14,10" />
        <line x1="400" y1="532" x2="758" y2="80" stroke="#161606" strokeWidth="4" strokeDasharray="14,10" />

        {/* Stadium wall arc (top of field) */}
        <ellipse cx="400" cy="370" rx="368" ry="305" fill="none" stroke="#182018" strokeWidth="8" />

        {/* Outfield wall padding marks */}
        {Array.from({ length: 18 }, (_, i) => {
          const frac = i / 17;
          const angle = Math.PI * frac;
          const wx = 400 + 368 * Math.cos(Math.PI - angle);
          const wy = 370 - 305 * Math.sin(Math.PI - angle);
          return <rect key={i} x={wx - 3} y={wy - 8} width="6" height="16" fill="#1a2a1a" />;
        })}

        {/* Stadium light towers */}
        {[0.08, 0.22, 0.38, 0.62, 0.78, 0.92].map((frac, i) => {
          const angle = Math.PI * frac;
          const lx = 400 + 368 * Math.cos(Math.PI - angle);
          const ly = 370 - 305 * Math.sin(Math.PI - angle) - 12;
          return (
            <g key={i}>
              <rect x={lx - 4} y={ly - 22} width="8" height="22" fill="#101e10" />
              <rect x={lx - 10} y={ly - 28} width="20" height="8" fill="#121e12" />
              <circle cx={lx - 5} cy={ly - 24} r="3" fill="#1c2e1c" />
              <circle cx={lx + 5} cy={ly - 24} r="3" fill="#1c2e1c" />
            </g>
          );
        })}

        {/* Center field distance marker */}
        <text x="400" y="180" textAnchor="middle" fill="#0e1e0e" fontSize="18" fontFamily="monospace" fontWeight="bold">400</text>

        {/* Foul pole markers */}
        <line x1="42" y1="80" x2="42" y2="55" stroke="#1a2a0a" strokeWidth="3" />
        <line x1="758" y1="80" x2="758" y2="55" stroke="#1a2a0a" strokeWidth="3" />
      </svg>
    </div>
  );
}

// ── FireworksCanvas ────────────────────────────────────────────
interface FWRocket {
  x: number; y: number; vx: number; vy: number;
  color: string;
  trail: Array<{ x: number; y: number }>;
}
interface FWParticle {
  x: number; y: number; vx: number; vy: number;
  alpha: number; color: string; radius: number;
}

function FireworksCanvas({ teamColor, active, overrideColors }: { teamColor: string; active: boolean; overrideColors?: string[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef<string[]>([teamColor, "#C4A35A", "#ffffff", "#ffd700"]);

  useEffect(() => {
    if (overrideColors && overrideColors.length > 0) {
      colorsRef.current = overrideColors;
    } else {
      colorsRef.current = [teamColor, "#C4A35A", "#ffffff", "#ffd700"];
    }
  }, [teamColor, overrideColors]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const rockets: FWRocket[] = [];
    const particles: FWParticle[] = [];
    const startTime = Date.now();
    let lastLaunch = 0;
    let animId = 0;

    const randColor = () => colorsRef.current[Math.floor(Math.random() * colorsRef.current.length)];

    // Launch a rocket from the bottom edge (classic ground fireworks)
    const launchFromBottom = () => {
      const x = 40 + Math.random() * (canvas.width - 80);
      const travelFrames = 48 + Math.random() * 32;
      const targetY = canvas.height * (0.07 + Math.random() * 0.38);
      rockets.push({
        x, y: canvas.height,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -(canvas.height - targetY) / travelFrames,
        color: randColor(),
        trail: [],
      });
    };

    // Launch a rocket from a left or right edge (angled inward and upward)
    const launchFromSide = () => {
      const fromLeft = Math.random() < 0.5;
      const x = fromLeft ? -4 : canvas.width + 4;
      const y = canvas.height * (0.5 + Math.random() * 0.35);
      const targetX = canvas.width * (fromLeft ? 0.25 + Math.random() * 0.5 : 0.25 + Math.random() * 0.5);
      const targetY = canvas.height * (0.1 + Math.random() * 0.32);
      const frames = 44 + Math.random() * 28;
      rockets.push({
        x, y,
        vx: (targetX - x) / frames,
        vy: (targetY - y) / frames,
        color: randColor(),
        trail: [],
      });
    };

    // 25% of dense-phase launches come from screen edges for variety
    const launch = (allowEdge = false) => {
      if (allowEdge && Math.random() < 0.25) {
        launchFromSide();
      } else {
        launchFromBottom();
      }
    };

    const explode = (r: FWRocket) => {
      const count = 36 + Math.floor(Math.random() * 28);
      const baseColor = randColor();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 1.5 + Math.random() * 3.8;
        particles.push({
          x: r.x, y: r.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.6,
          alpha: 1,
          color: Math.random() < 0.35 ? randColor() : baseColor,
          radius: 1 + Math.random() * 2.2,
        });
      }
    };

    const tick = () => {
      const elapsed = Date.now() - startTime;
      // Dense phase:       0–8s  — 2 rockets/launch, edge launches enabled
      // Medium phase:    8–16s  — 1 rocket/launch, bottom only
      // Sparse phase:   16–28s  — occasional rocket
      // Taper phase:      28s+  — near-zero cadence (one rocket every ~10s)
      const dense  = elapsed < 8000;
      const medium = elapsed < 16000;
      const sparse = elapsed < 28000;
      const interval = dense ? 650 : medium ? 1500 : sparse ? 3200 : 9000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (elapsed - lastLaunch > interval * (0.75 + Math.random() * 0.5)) {
        launch(dense);          // edge launches only during dense phase
        if (dense) launch(true); // second rocket during dense phase
        lastLaunch = elapsed;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 10) r.trail.shift();
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.055;

        r.trail.forEach((pt, idx) => {
          ctx.globalAlpha = ((idx + 1) / r.trail.length) * 0.45;
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
        ctx.fill();

        if (r.vy >= 0) {
          explode(r);
          rockets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.09;
        p.vx *= 0.97;
        p.alpha -= 0.017;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 5 }}
      aria-hidden
      data-testid="fireworks-canvas"
    />
  );
}

// ── SmokeEmbers ────────────────────────────────────────────────
// Slow-rising semi-transparent particles simulating stadium atmosphere.
function SmokeEmbers() {
  const embers = useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      left: `${(i * 6.4) % 96}%`,
      delay: `${(i * 1.15) % 8}s`,
      duration: `${6.5 + (i * 0.85) % 5}s`,
      size: `${3 + (i * 1.2) % 7}px`,
      drift: `${i % 2 === 0 ? 22 + (i * 3) % 16 : -(22 + (i * 3) % 16)}px`,
      opacity: 0.18 + (i * 0.04) % 0.28,
    }))
  , []);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 4 }}
      aria-hidden
    >
      {embers.map((e, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: "-16px",
            left: e.left,
            width: e.size,
            height: e.size,
            borderRadius: "50%",
            background: `rgba(170, 210, 170, ${e.opacity})`,
            animation: `sdEmberRise ${e.duration} ease-in ${e.delay} infinite`,
            "--sd-drift": e.drift,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── FlickerOverlay ─────────────────────────────────────────────
// White light flicker simulating stadium lights turning on during buildup.
function FlickerOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 15,
        background: "rgba(200,240,200,0.18)",
        animation: "sdFlicker 1.5s ease-out forwards",
      }}
    />
  );
}

// ── CinematicBurst ─────────────────────────────────────────────
// Team-color radial flash that expands then fades during the burst phase.
function CinematicBurst({ color, active }: { color: string; active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-testid="cinematic-burst"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 20,
        background: `radial-gradient(ellipse at center, ${color}cc 0%, ${color}66 28%, transparent 62%)`,
        animation: "sdBurstExpand 0.5s ease-out forwards",
        transformOrigin: "center center",
      }}
    />
  );
}

// ── GemSpotlight ───────────────────────────────────────────────
// Dark radial vignette that draws the eye to center screen during
// the gem ceremony spotlight phase.
function GemSpotlight({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-testid="gem-spotlight"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 25,
        background: "radial-gradient(ellipse 48% 52% at center, transparent 0%, rgba(0,4,0,0.90) 100%)",
        animation: "sdGemSpotlight 0.45s ease-out forwards",
      }}
    />
  );
}

// ── GemBurst ───────────────────────────────────────────────────
// Amber/gold radial flash distinct from the team-color CinematicBurst.
function GemBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-testid="gem-burst"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 28,
        background: "radial-gradient(ellipse at center, #FFD70099 0%, #C4A35A55 35%, transparent 68%)",
        animation: "sdGemBurstExpand 0.8s ease-out forwards",
        transformOrigin: "center center",
      }}
    />
  );
}

// ── SigningDayRevealPage ───────────────────────────────────────
type CinemaPhase = "idle" | "buildup" | "burst" | "cards";
type GemPhase = "waiting" | "spotlight" | "burst" | "revealed";

export default function SigningDayRevealPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialTeamId = params.get("teamId") ?? undefined;

  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(initialTeamId);
  const [isDownloading, setIsDownloading] = useState(false);
  const cardGridRef = useRef<HTMLDivElement>(null);

  const reducedMotion = useReducedMotion();
  const [cinemaPhase, setCinemaPhase] = useState<CinemaPhase>("idle");

  // ── Gem ceremony state ──────────────────────────────────────
  const [gemPhase, setGemPhase] = useState<GemPhase>("waiting");
  const [gemColorOverride, setGemColorOverride] = useState<string[] | null>(null);
  // Once fired, the ceremony never repeats even on team switch.
  const gemCeremonyFired = useRef(false);

  const { data, isLoading } = useQuery<RevealData>({
    queryKey: ["/api/leagues", leagueId, "signing-day-reveal"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/signing-day-reveal`);
      if (!res.ok) throw new Error("Failed to fetch reveal data");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const effectiveTeamId: string | undefined =
    selectedTeamId ??
    (data?.myTeamId ?? data?.allTeams?.[0]?.id);

  const currentEntry = data?.teamData?.find(t => t.team.id === effectiveTeamId) ?? null;
  const teamColor = currentEntry?.team.primaryColor ?? "#C4A35A";

  // Track teams that have already had the reveal POST fired to avoid duplicate calls.
  const revealedTeams = useRef<Set<string>>(new Set());

  // ── Cinematic phase state machine ──────────────────────────
  // Re-runs when the selected team changes (or data first arrives).
  useEffect(() => {
    if (!currentEntry) return;

    if (reducedMotion) {
      setCinemaPhase("cards");
      return;
    }

    setCinemaPhase("buildup");
    const t1 = setTimeout(() => setCinemaPhase("burst"), 1500);
    const t2 = setTimeout(() => setCinemaPhase("cards"), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentEntry?.team.id, reducedMotion]);

  // ── Fire reveal-complete when cards become visible ──────────
  // Marks recruits as signingDayRevealed so the recruiting board
  // shows full attributes after the coach has watched the reveal.
  useEffect(() => {
    if (cinemaPhase !== "cards" || !currentEntry || !leagueId) return;
    const teamId = currentEntry.team.id;
    if (revealedTeams.current.has(teamId)) return;
    revealedTeams.current.add(teamId);
    apiRequest("POST", `/api/leagues/${leagueId}/signing-day-reveal/complete?teamId=${teamId}`)
      .catch((err) => console.error("[reveal-complete] failed:", err));
  }, [cinemaPhase, currentEntry?.team.id, leagueId]);

  // ── Derived: split recruits for gem ceremony ─────────────────
  // When reducedMotion is true, gemRecruit stays null so the gem
  // renders in the normal grid with no held-back slot.
  const sortedRecruits = useMemo(
    () => [...(currentEntry?.recruits ?? [])].sort((a, b) => b.overall - a.overall),
    [currentEntry]
  );
  const gemRecruit = useMemo(
    () => (!reducedMotion ? (sortedRecruits.find(r => r.isGenerationalGem && r.gemBustRevealed) ?? null) : null),
    [sortedRecruits, reducedMotion]
  );
  const regularRecruits = useMemo(
    () => gemRecruit ? sortedRecruits.filter(r => !(r.isGenerationalGem && r.gemBustRevealed)) : sortedRecruits,
    [sortedRecruits, gemRecruit]
  );

  // ── Reset gem phase when team changes ───────────────────────
  useEffect(() => {
    setGemPhase("waiting");
    setGemColorOverride(null);
  }, [currentEntry?.team.id]);

  // ── Gem ceremony timer ───────────────────────────────────────
  // Fires 1.5s after cards are visible — once per page load.
  useEffect(() => {
    if (cinemaPhase !== "cards" || !gemRecruit || gemCeremonyFired.current) return;
    gemCeremonyFired.current = true;

    // Regular cards take ~(n * 0.06)s to stagger in; 1.5s is well past
    // the last card for most class sizes.
    const t1 = setTimeout(() => setGemPhase("spotlight"), 1500);
    const t2 = setTimeout(() => setGemPhase("burst"),     2100);
    const t3 = setTimeout(() => {
      setGemPhase("revealed");
      setGemColorOverride(["#FFD700", "#FFA500", "#FFEC00", "#C4A35A"]);
    }, 2600);
    // Return to team colors after 4 seconds of gold fireworks
    const t4 = setTimeout(() => setGemColorOverride(null), 6600);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, [cinemaPhase, gemRecruit]);

  const handleDownload = async () => {
    if (!cardGridRef.current || !currentEntry) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardGridRef.current, {
        backgroundColor: "#0a1a0a",
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `${currentEntry.team.abbreviation}-class-${data?.league.currentSeason ?? "season"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-40 h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const classRank = data && currentEntry ? getClassRank(data.teamData, currentEntry.team.id) : 0;
  const classScore = currentEntry ? getClassScore(currentEntry.recruits) : 0;
  const showCards = cinemaPhase === "cards";

  return (
    <div className="relative min-h-screen">
      {/* ── Pixel stadium background (not in html2canvas) ── */}
      <StadiumBackground isBuildup={!reducedMotion && cinemaPhase === "buildup"} />

      {/* ── Cinematic effect layers (fixed, not in html2canvas) ── */}
      {!reducedMotion && (
        <>
          <FireworksCanvas
            key={currentEntry?.team.id ?? "default"}
            teamColor={teamColor}
            active={cinemaPhase !== "idle"}
            overrideColors={gemColorOverride}
          />
          <SmokeEmbers />
          <FlickerOverlay active={cinemaPhase === "buildup"} />
          <CinematicBurst color={teamColor} active={cinemaPhase === "burst"} />
          <GemSpotlight active={gemPhase === "spotlight" || gemPhase === "burst"} />
          <GemBurst active={gemPhase === "burst"} />
        </>
      )}

      {/* ── Main content (z-10, above the background layers) ── */}
      <div className="relative z-10 p-4 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href={`/league/${leagueId}/commits`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back-to-commits">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Commits
            </RetroButton>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-pixel text-lg text-[#C4A35A] leading-tight">SIGNING DAY REVEAL</h1>
            <p className="text-xs text-gray-400">
              Season {data?.league.currentSeason} · Click any card to flip it
            </p>
          </div>
          {currentEntry && (
            <RetroButton
              variant="primary"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
              data-testid="button-download-class-photo"
            >
              <Download className="w-4 h-4 mr-1" />
              {isDownloading ? "Saving..." : "Download Class Photo"}
            </RetroButton>
          )}
        </div>

        {/* Team selector */}
        {data && data.allTeams.length > 1 && (
          <div className="mb-6">
            <p className="text-xs text-gray-500 mb-2 font-pixel">SELECT TEAM</p>
            <div className="flex flex-wrap gap-2">
              {data.allTeams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  data-testid={`team-selector-${team.abbreviation}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all text-xs"
                  style={{
                    borderColor: effectiveTeamId === team.id ? team.primaryColor : "#2d3d2d",
                    background: effectiveTeamId === team.id ? `${team.primaryColor}22` : "transparent",
                    color: effectiveTeamId === team.id ? "#ffffff" : "#9ca3af",
                  }}
                >
                  <TeamBadge
                    abbreviation={team.abbreviation}
                    primaryColor={team.primaryColor}
                    secondaryColor={team.secondaryColor}
                    size="sm"
                  />
                  <span className="hidden sm:inline">{team.name}</span>
                  <span className="sm:hidden">{team.abbreviation}</span>
                  {data.myTeamId === team.id && (
                    <span className="text-[8px] font-pixel text-[#C4A35A] ml-0.5">(You)</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active team class display */}
        {showCards && currentEntry ? (
          <div>
            {/* Card grid — captured by html2canvas (no background effects inside) */}
            <div
              ref={cardGridRef}
              className="rounded-lg p-4"
              style={{ background: "#0d1f0d" }}
            >
              {/* Watermark header (included in download) */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#2d3d2d]">
                <TeamBadge
                  abbreviation={currentEntry.team.abbreviation}
                  primaryColor={currentEntry.team.primaryColor}
                  secondaryColor={currentEntry.team.secondaryColor}
                  name={currentEntry.team.name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-pixel text-sm text-[#C4A35A]">{currentEntry.team.name}</div>
                  {currentEntry.team.conference && (
                    <div className="text-xs text-gray-400">{currentEntry.team.conference}</div>
                  )}
                  <div className="flex items-center flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-[#C4A35A]" />
                      Season {data.league.currentSeason} Signing Class
                    </span>
                    <span>{currentEntry.recruits.length} commits</span>
                  </div>
                </div>
                {/* Class rank badge */}
                {classRank > 0 && (
                  <div className="shrink-0 text-right">
                    <div
                      className="font-pixel text-xl leading-none"
                      style={{ color: classRank === 1 ? "#C4A35A" : classRank <= 3 ? "#facc15" : "#9ca3af" }}
                    >
                      #{classRank}
                    </div>
                    <div className="text-[9px] text-gray-500">Natl Rank</div>
                    <div className="font-pixel text-[9px] text-[#C4A35A]">{classScore.toFixed(1)} pts</div>
                  </div>
                )}
              </div>

              {/* Card grid — regular recruits (gem held back for ceremony) */}
              {currentEntry.recruits.length === 0 ? (
                <div className="text-center text-gray-500 py-16">
                  <p className="font-pixel text-sm">No commits yet</p>
                  <p className="text-xs mt-2">Recruits will appear here once they sign</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 justify-start">
                  {regularRecruits.map((recruit, idx) => {
                    const animDelay = idx * 0.06;
                    const isSpecial =
                      (recruit.isBlueChip && !recruit.isGenerationalBust && !recruit.isGenerationalGem);
                    return (
                      <div
                        key={recruit.id}
                        className="relative"
                        style={{ flexShrink: 0 }}
                        data-testid={`card-wrapper-${recruit.id}`}
                      >
                        {!reducedMotion && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              inset: -4,
                              borderRadius: "10px",
                              zIndex: 10,
                              animation: isSpecial
                                ? `sdShockwave 0.85s ease-out ${animDelay + 0.55}s both`
                                : `sdSparkRing 0.5s ease-out ${animDelay + 0.45}s both`,
                            }}
                            aria-hidden
                          />
                        )}
                        <RecruitCard
                          recruit={recruit}
                          primaryColor={currentEntry.team.primaryColor}
                          secondaryColor={currentEntry.team.secondaryColor}
                          animationDelay={animDelay}
                          disableAnimation={reducedMotion}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Generational Gem ceremony reveal ── */}
            {gemRecruit && (
              <div
                className="mt-8 flex flex-col items-center gap-3"
                data-testid="gem-card-section"
              >
                {gemPhase === "revealed" && (
                  <>
                    {/* "GENERATIONAL TALENT" pixel label */}
                    <div
                      className="font-pixel text-amber-400 text-[9px] tracking-widest"
                      style={{ animation: "sdGemLabelPulse 2.2s ease-in-out infinite" }}
                      data-testid="gem-label"
                    >
                      ✦ GENERATIONAL TALENT ✦
                    </div>

                    {/* Gem card wrapper with slide-in animation + persistent glow */}
                    <div
                      className="relative"
                      style={{ animation: "sdGemSlideIn 0.7s ease-out both" }}
                      data-testid="gem-card-wrapper"
                    >
                      {/* Shockwave ring fires on arrival */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          inset: -4,
                          borderRadius: "10px",
                          zIndex: 10,
                          animation: "sdShockwave 0.9s ease-out 0.25s both",
                        }}
                        aria-hidden
                      />
                      {/* Persistent amber glow border */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          inset: -3,
                          borderRadius: "11px",
                          zIndex: 8,
                          boxShadow:
                            "0 0 18px 4px rgba(251,191,36,0.45), 0 0 38px 8px rgba(251,191,36,0.18), inset 0 0 10px 2px rgba(251,191,36,0.08)",
                        }}
                        aria-hidden
                      />
                      <RecruitCard
                        recruit={gemRecruit}
                        primaryColor={currentEntry.team.primaryColor}
                        secondaryColor={currentEntry.team.secondaryColor}
                        animationDelay={0}
                        disableAnimation={false}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Class summary stats below cards (not in download) */}
            {currentEntry.recruits.length > 0 && (
              <RetroCard className="mt-4">
                <RetroCardContent className="py-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {[
                      { label: "Total", value: currentEntry.recruits.length },
                      { label: "5-Star", value: currentEntry.recruits.filter(r => r.starRating === 5).length },
                      { label: "4-Star", value: currentEntry.recruits.filter(r => r.starRating === 4).length },
                      { label: "3-Star", value: currentEntry.recruits.filter(r => r.starRating === 3).length },
                      { label: "Avg OVR", value: Math.round(currentEntry.recruits.reduce((s, r) => s + r.overall, 0) / currentEntry.recruits.length) },
                      { label: "Blue Chips", value: currentEntry.recruits.filter(r => r.isBlueChip).length },
                      { label: "Transfers", value: currentEntry.recruits.filter(r => r.recruitType === "TRANSFER").length },
                      { label: "JUCO", value: currentEntry.recruits.filter(r => r.recruitType === "JUCO").length },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col items-center min-w-[48px]">
                        <span className="font-pixel text-lg text-white">{value}</span>
                        <span className="text-[10px] text-gray-400">{label}</span>
                      </div>
                    ))}
                  </div>
                </RetroCardContent>
              </RetroCard>
            )}
          </div>
        ) : !showCards && currentEntry ? (
          /* Cinematic intro playing — show a dramatic holding area */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div
              className="font-pixel text-2xl text-[#C4A35A] animate-pulse"
              style={{ textShadow: "0 0 20px rgba(196,163,90,0.6), 0 0 40px rgba(196,163,90,0.3)" }}
              data-testid="cinematic-loading-text"
            >
              {cinemaPhase === "buildup" ? "SIGNING DAY" : ""}
            </div>
            {cinemaPhase === "buildup" && (
              <div className="text-xs text-gray-500 font-pixel tracking-widest animate-pulse">
                THE MOMENT IS HERE
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-16">
            <p className="font-pixel text-sm">No team data available</p>
            <p className="text-xs mt-2">Select a team above to view their signing class</p>
          </div>
        )}
      </div>
    </div>
  );
}
