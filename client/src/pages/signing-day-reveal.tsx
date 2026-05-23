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

// ── SkyBackground ─────────────────────────────────────────────
// Bright cinematic sky gradient — outdoor daytime feel.
function SkyBackground({ isBuildup }: { isBuildup: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      data-testid="stadium-background"
      style={
        isBuildup
          ? { animation: "sdSkyBuild 1.5s ease-in-out forwards" }
          : { opacity: 1 }
      }
    >
      {/* Main sky gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, #5ba3d9 0%, #7dbde8 20%, #a8d4f0 45%, #c8e8f8 65%, #dff0d8 82%, #c8dcb0 100%)",
        }}
      />
      {/* Horizon shimmer band */}
      <div
        style={{
          position: "absolute",
          bottom: "18%",
          left: 0,
          right: 0,
          height: "6%",
          background: "linear-gradient(180deg, transparent 0%, rgba(220,235,200,0.4) 100%)",
        }}
      />
      {/* Clouds */}
      <div style={{ position: "absolute", top: "7%",  left: "10%",  width: 130, height: 40, background: "rgba(255,255,255,0.55)", borderRadius: 50 }} />
      <div style={{ position: "absolute", top: "5%",  left: "8%",   width: 80,  height: 28, background: "rgba(255,255,255,0.45)", borderRadius: 50 }} />
      <div style={{ position: "absolute", top: "11%", right: "18%", width: 160, height: 48, background: "rgba(255,255,255,0.50)", borderRadius: 50 }} />
      <div style={{ position: "absolute", top: "9%",  right: "16%", width: 95,  height: 28, background: "rgba(255,255,255,0.38)", borderRadius: 50 }} />
      <div style={{ position: "absolute", top: "4%",  left: "45%",  width: 110, height: 35, background: "rgba(255,255,255,0.42)", borderRadius: 50 }} />
      {/* Subtle ground / outfield suggestion */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "22%",
          background: "linear-gradient(180deg, transparent 0%, rgba(140,180,80,0.22) 100%)",
        }}
      />
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
      const dense  = elapsed < 8000;
      const medium = elapsed < 16000;
      const sparse = elapsed < 28000;
      const interval = dense ? 650 : medium ? 1500 : sparse ? 3200 : 9000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (elapsed - lastLaunch > interval * (0.75 + Math.random() * 0.5)) {
        launch(dense);
        if (dense) launch(true);
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

// ── FlickerOverlay ─────────────────────────────────────────────
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
        background: "rgba(220,240,255,0.22)",
        animation: "sdFlicker 1.5s ease-out forwards",
      }}
    />
  );
}

// ── CinematicBurst ─────────────────────────────────────────────
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

// ── Position family color ──────────────────────────────────────
function getPositionFamilyColor(position: string): string {
  if (position === "P")                           return "#dc2626"; // red
  if (position === "C")                           return "#1c1c1c"; // black
  if (["1B","2B","3B","SS"].includes(position))   return "#2563eb"; // blue
  if (position === "OF")                          return "#16a34a"; // green
  if (position === "DH")                          return "#7c3aed"; // purple
  return "#6b7280";
}

// ── LetterOfIntentCard ─────────────────────────────────────────
// Cream application form card displayed in the bottom row.
function LetterOfIntentCard({
  recruit,
  isRainbow,
  animationDelay,
  reducedMotion,
  gemRevealed,
}: {
  recruit: RevealRecruit;
  isRainbow?: boolean;
  animationDelay?: number;
  reducedMotion?: boolean;
  gemRevealed?: boolean;
}) {
  const delay = animationDelay ?? 0;
  const posColor = getPositionFamilyColor(recruit.position);

  return (
    <div
      style={{
        width: "160px",
        height: "220px",
        flexShrink: 0,
        position: "relative",
        animation: reducedMotion ? "none" : `loiCardSlideUp 0.5s ease-out ${delay}s both`,
      }}
      data-testid={`loi-card-${recruit.id}`}
    >
      {/* Rainbow spinning border wrapper */}
      {isRainbow && (
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 11,
            background: "conic-gradient(from 0deg, #ff0000, #ff8800, #ffff00, #00cc00, #0088ff, #8800ff, #ff0088, #ff0000)",
            animation: reducedMotion ? "none" : "loiRainbowSpin 2.5s linear infinite",
            zIndex: 0,
          }}
          aria-hidden
        />
      )}

      {/* Card body */}
      <div
        style={{
          position: "absolute",
          inset: isRainbow ? 3 : 0,
          borderRadius: isRainbow ? 9 : 8,
          background: "#f8f4ec",
          border: isRainbow ? "none" : "2px solid #d4c9a0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          zIndex: 1,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            background: "#1a1a1a",
            padding: "5px 8px",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <span
            className="font-pixel tracking-widest"
            style={{ fontSize: "6px", color: "#e5c97a", letterSpacing: "0.12em" }}
          >
            LETTER OF INTENT
          </span>
        </div>

        {/* Position badge strip */}
        <div
          style={{
            background: posColor,
            height: "18px",
            display: "flex",
            alignItems: "center",
            paddingLeft: "8px",
            flexShrink: 0,
          }}
        >
          <span className="font-pixel" style={{ fontSize: "7px", color: "#ffffff", fontWeight: "bold" }}>
            {recruit.position}
          </span>
        </div>

        {/* Silhouette photo area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 12px 4px",
          }}
        >
          <div
            style={{
              width: "88px",
              height: "100px",
              background: "#d8d3ca",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #c4bfb4",
              overflow: "hidden",
            }}
          >
            {/* Person silhouette SVG */}
            <svg viewBox="0 0 40 52" width="68" height="88" aria-hidden>
              {/* Head */}
              <ellipse cx="20" cy="12" rx="8" ry="9" fill="#b8b4ac" />
              {/* Shoulders / body */}
              <path d="M5 52 Q5 32 20 29 Q35 32 35 52 Z" fill="#b8b4ac" />
              {/* Subtle collar */}
              <path d="M17 29 Q20 33 23 29" fill="none" stroke="#a8a49c" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* Bottom row: state label + red stamp */}
        <div
          style={{
            padding: "4px 8px 8px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "8px", color: "#666", fontFamily: "monospace" }}>
            {recruit.homeState}
          </span>

          {/* Red circular stamp seal */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: "2.5px solid #b91c1c",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              opacity: gemRevealed ? 1 : 0.82,
              background: "rgba(185,28,28,0.06)",
              gap: 1,
            }}
          >
            <span className="font-pixel" style={{ fontSize: "5px", color: "#b91c1c", lineHeight: 1.2, textAlign: "center" }}>
              {gemRevealed ? "★" : "SIGNED"}
            </span>
            {!gemRevealed && (
              <span className="font-pixel" style={{ fontSize: "4.5px", color: "#b91c1c", lineHeight: 1 }}>
                NLI
              </span>
            )}
            {gemRevealed && (
              <span className="font-pixel" style={{ fontSize: "4px", color: "#b91c1c", lineHeight: 1 }}>
                GEN GEM
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
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

  const revealedTeams = useRef<Set<string>>(new Set());

  // ── Cinematic phase state machine ──────────────────────────
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
  useEffect(() => {
    if (cinemaPhase !== "cards" || !currentEntry || !leagueId) return;
    const teamId = currentEntry.team.id;
    if (revealedTeams.current.has(teamId)) return;
    revealedTeams.current.add(teamId);
    apiRequest("POST", `/api/leagues/${leagueId}/signing-day-reveal/complete?teamId=${teamId}`)
      .catch((err) => console.error("[reveal-complete] failed:", err));
  }, [cinemaPhase, currentEntry?.team.id, leagueId]);

  // ── Derived: split recruits for gem ceremony ─────────────────
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
  useEffect(() => {
    if (cinemaPhase !== "cards" || !gemRecruit || gemCeremonyFired.current) return;
    gemCeremonyFired.current = true;

    const t1 = setTimeout(() => setGemPhase("spotlight"), 1500);
    const t2 = setTimeout(() => setGemPhase("burst"),     2100);
    const t3 = setTimeout(() => {
      setGemPhase("revealed");
      setGemColorOverride(["#FFD700", "#FFA500", "#FFEC00", "#C4A35A"]);
    }, 2600);
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
        backgroundColor: "#0e1c2e",
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
      {/* ── Sky cinematic background ── */}
      <SkyBackground isBuildup={!reducedMotion && cinemaPhase === "buildup"} />

      {/* ── Cinematic effect layers (fixed, not in html2canvas) ── */}
      {!reducedMotion && (
        <>
          <FireworksCanvas
            key={currentEntry?.team.id ?? "default"}
            teamColor={teamColor}
            active={cinemaPhase !== "idle"}
            overrideColors={gemColorOverride}
          />
          <FlickerOverlay active={cinemaPhase === "buildup"} />
          <CinematicBurst color={teamColor} active={cinemaPhase === "burst"} />
          <GemSpotlight active={gemPhase === "spotlight" || gemPhase === "burst"} />
          <GemBurst active={gemPhase === "burst"} />
        </>
      )}

      {/* ── Main content (z-10, above background layers) ── */}
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
            <p className="text-xs text-gray-600">
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
            <p className="text-xs text-gray-600 mb-2 font-pixel">SELECT TEAM</p>
            <div className="flex flex-wrap gap-2">
              {data.allTeams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  data-testid={`team-selector-${team.abbreviation}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border transition-all text-xs"
                  style={{
                    borderColor: effectiveTeamId === team.id ? team.primaryColor : "#2d3d2d",
                    background: effectiveTeamId === team.id ? `${team.primaryColor}22` : "rgba(0,0,0,0.15)",
                    color: effectiveTeamId === team.id ? "#ffffff" : "#4b5563",
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
            {/* Card grid — captured by html2canvas */}
            <div
              ref={cardGridRef}
              className="rounded-lg p-4"
              style={{ background: "#0e1c2e" }}
            >
              {/* Watermark header */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#1e3050]">
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
                      Season {data?.league.currentSeason} Signing Class
                    </span>
                    <span>{currentEntry.recruits.length} commits</span>
                  </div>
                </div>
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

              {/* Two-row Power Pros layout */}
              {currentEntry.recruits.length === 0 ? (
                <div className="text-center text-gray-500 py-16">
                  <p className="font-pixel text-sm">No commits yet</p>
                  <p className="text-xs mt-2">Recruits will appear here once they sign</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-hidden">
                  <div style={{ minWidth: "max-content" }}>

                    {/* ── Row 1: Recruit portrait cards ── */}
                    <div className="flex gap-3 mb-3">
                      {regularRecruits.map((recruit, idx) => {
                        const animDelay = idx * 0.06;
                        const isSpecial = recruit.isBlueChip && !recruit.isGenerationalBust && !recruit.isGenerationalGem;
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

                      {/* Gem card in row 1 — only visible after ceremony */}
                      {gemRecruit && gemPhase === "revealed" && (
                        <div
                          className="relative"
                          style={{ flexShrink: 0, animation: "sdGemSlideIn 0.7s ease-out both" }}
                          data-testid="gem-card-wrapper"
                        >
                          {/* Shockwave on arrival */}
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
                          {/* Persistent amber glow */}
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
                      )}

                      {/* Placeholder gem slot before ceremony fires */}
                      {gemRecruit && gemPhase !== "revealed" && (
                        <div
                          style={{
                            width: "160px",
                            height: "220px",
                            flexShrink: 0,
                            borderRadius: "8px",
                            border: "2px dashed rgba(251,191,36,0.3)",
                            background: "rgba(251,191,36,0.04)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-hidden
                        >
                          <span
                            className="font-pixel text-[8px] text-amber-500/40"
                            style={{ animation: "sdGemLabelPulse 2.2s ease-in-out infinite" }}
                          >
                            ✦
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Row 2: Letter of Intent application cards ── */}
                    <div className="flex gap-3">
                      {regularRecruits.map((recruit, idx) => {
                        const isBlueChip = !!(recruit.isBlueChip && !recruit.isGenerationalBust && !recruit.isGenerationalGem);
                        return (
                          <LetterOfIntentCard
                            key={recruit.id}
                            recruit={recruit}
                            isRainbow={isBlueChip}
                            animationDelay={idx * 0.06 + 0.25}
                            reducedMotion={reducedMotion}
                          />
                        );
                      })}

                      {/* Gem LOI card — rainbow border, revealed after ceremony */}
                      {gemRecruit && gemPhase === "revealed" && (
                        <LetterOfIntentCard
                          key={`loi-gem-${gemRecruit.id}`}
                          recruit={gemRecruit}
                          isRainbow={true}
                          animationDelay={0.1}
                          reducedMotion={reducedMotion}
                          gemRevealed={true}
                        />
                      )}

                      {/* Placeholder LOI slot before ceremony */}
                      {gemRecruit && gemPhase !== "revealed" && (
                        <div
                          style={{
                            width: "160px",
                            height: "220px",
                            flexShrink: 0,
                            borderRadius: "8px",
                            border: "2px dashed rgba(251,191,36,0.2)",
                            background: "rgba(251,191,36,0.02)",
                          }}
                          aria-hidden
                        />
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* Gem ceremony label — shown above grid when revealed */}
              {gemRecruit && gemPhase === "revealed" && (
                <div className="flex justify-center mt-3" data-testid="gem-card-section">
                  <div
                    className="font-pixel text-amber-400 text-[9px] tracking-widest"
                    style={{ animation: "sdGemLabelPulse 2.2s ease-in-out infinite" }}
                    data-testid="gem-label"
                  >
                    ✦ GENERATIONAL TALENT ✦
                  </div>
                </div>
              )}
            </div>

            {/* Class summary stats */}
            {currentEntry.recruits.length > 0 && (
              <RetroCard className="mt-4">
                <RetroCardContent className="py-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {[
                      { label: "Total",      value: currentEntry.recruits.length },
                      { label: "5-Star",     value: currentEntry.recruits.filter(r => r.starRating === 5).length },
                      { label: "4-Star",     value: currentEntry.recruits.filter(r => r.starRating === 4).length },
                      { label: "3-Star",     value: currentEntry.recruits.filter(r => r.starRating === 3).length },
                      { label: "Avg OVR",    value: Math.round(currentEntry.recruits.reduce((s, r) => s + r.overall, 0) / currentEntry.recruits.length) },
                      { label: "Blue Chips", value: currentEntry.recruits.filter(r => r.isBlueChip).length },
                      { label: "Transfers",  value: currentEntry.recruits.filter(r => r.recruitType === "TRANSFER").length },
                      { label: "JUCO",       value: currentEntry.recruits.filter(r => r.recruitType === "JUCO").length },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col items-center min-w-[48px]">
                        <span className="font-pixel text-lg text-white">{value}</span>
                        <span className="text-[10px] text-gray-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </RetroCardContent>
              </RetroCard>
            )}
          </div>
        ) : !showCards && currentEntry ? (
          /* Cinematic intro playing */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div
              className="font-pixel text-2xl text-[#C4A35A] animate-pulse"
              style={{ textShadow: "0 0 20px rgba(196,163,90,0.6), 0 0 40px rgba(196,163,90,0.3)" }}
              data-testid="cinematic-loading-text"
            >
              {cinemaPhase === "buildup" ? "SIGNING DAY" : ""}
            </div>
            {cinemaPhase === "buildup" && (
              <div className="text-xs text-gray-600 font-pixel tracking-widest animate-pulse">
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
