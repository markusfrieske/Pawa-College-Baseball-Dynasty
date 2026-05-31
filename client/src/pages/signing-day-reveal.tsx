import { useRef, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { CardBack, getTypeBadge } from "@/components/recruit-card";
import type { RevealRecruit } from "@/components/recruit-card";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerAvatar } from "@/components/player-avatar";
import { ArrowLeft, Crown, Download, Trophy } from "lucide-react";

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

interface LeagueRevealItem extends RevealRecruit {
  signingTeamId: string;
  signingTeamName: string;
  signingTeamAbbreviation: string;
  signingTeamPrimaryColor: string;
  signingTeamSecondaryColor: string;
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

// ── OVR helpers (local, avoids coupling to recruit-card internals) ────
function getRevealOvrColor(ovr: number): string {
  if (ovr >= 600) return "#ff69b4";
  if (ovr >= 500) return "#ef4444";
  if (ovr >= 400) return "#eab308";
  if (ovr >= 300) return "#22c55e";
  return "#9ca3af";
}
function getRevealOvrBorderColor(ovr: number): string {
  if (ovr >= 600) return "#ff69b4";
  if (ovr >= 500) return "#ef4444";
  if (ovr >= 400) return "#eab308";
  if (ovr >= 300) return "#22c55e";
  return "#d4c9a0";
}
function getRevealOvrGlow(ovr: number): string {
  if (ovr >= 600) return "0 0 18px #ff69b4, 0 0 36px #ff1493, 0 0 54px #ff69b490";
  if (ovr >= 500) return "0 0 16px #ef4444, 0 0 32px #dc2626, 0 0 48px #ef444460";
  if (ovr >= 400) return "0 0 14px #eab308, 0 0 28px #ca8a04, 0 0 42px #eab30860";
  if (ovr >= 300) return "0 0 12px #22c55e, 0 0 24px #16a34a, 0 0 36px #22c55e60";
  return "none";
}

// ── RevealCardFront ────────────────────────────────────────────
function RevealCardFront({ recruit, primaryColor, signingTeamAbbrev, signingTeamColor }: {
  recruit: RevealRecruit;
  primaryColor: string;
  signingTeamAbbrev?: string;
  signingTeamColor?: string;
}) {
  const posColor = getPositionFamilyColor(recruit.position);
  const ovrColor = getRevealOvrColor(recruit.overall);
  const isGen    = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust= !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  // Type badge
  let badgeLabel = "RAW";
  let badgeBg    = "#374151";
  let badgeColor = "#9ca3af";
  let badgePulse = false;
  if (isGen) {
    badgeLabel = "GEN GEM ✦"; badgeBg = "#92400e"; badgeColor = "#fbbf24"; badgePulse = true;
  } else if (isGenBust) {
    badgeLabel = "GEN BUST ✦"; badgeBg = "#7f1d1d"; badgeColor = "#fca5a5"; badgePulse = true;
  } else if (recruit.isGem && recruit.gemBustRevealed) {
    badgeLabel = "GEM"; badgeBg = "#065f46"; badgeColor = "#6ee7b7";
  } else if (recruit.isBust && recruit.gemBustRevealed) {
    badgeLabel = "BUST"; badgeBg = "#7f1d1d"; badgeColor = "#fca5a5";
  } else if (recruit.recruitType === "STORYLINE") {
    badgeLabel = "STORYLINE"; badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "TRANSFER") {
    badgeLabel = recruit.fromTeamName ? `XFER·${recruit.fromTeamName.slice(0, 7)}` : "TRANSFER";
    badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "JUCO") {
    badgeLabel = recruit.fromTeamName ? `JUCO·${recruit.fromTeamName.slice(0, 7)}` : "JUCO";
    badgeBg = "#0e7490"; badgeColor = "#a5f3fc";
  }

  const batHand   = (recruit as unknown as Record<string, string>).batHand   || "R";
  const throwHand = (recruit as unknown as Record<string, string>).throwHand || "R";
  const hometown  = (recruit as unknown as Record<string, string>).hometown;
  const location  = hometown ? `${hometown}, ${recruit.homeState}` : recruit.homeState;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8f4ec", borderRadius: "6px", overflow: "hidden" }}>

      {/* Team strip — shown in league-wide cinematic mode */}
      {signingTeamAbbrev && (
        <div style={{
          background: signingTeamColor || primaryColor,
          height: "13px",
          display: "flex",
          alignItems: "center",
          padding: "0 5px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(0,0,0,0.2)",
        }}>
          <span className="font-pixel" style={{ fontSize: "5.5px", color: "#fff", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signingTeamAbbrev}
          </span>
        </div>
      )}

      {/* Position + Rank */}
      <div style={{ background: posColor, height: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 7px", flexShrink: 0 }}>
        <span className="font-pixel" style={{ fontSize: "8px", color: "#fff", fontWeight: "bold" }} data-testid={`card-position-${recruit.id}`}>
          {recruit.position}
        </span>
        <span className="font-pixel" style={{ fontSize: "7px", color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: "2px" }}>
          {recruit.isBlueChip && !isGen && !isGenBust && <Crown style={{ width: "9px", height: "9px" }} />}
          {recruit.classRank > 0 ? `#${recruit.classRank}` : ""}
        </span>
      </div>

      {/* Stars */}
      <div style={{ height: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#f0ebe0", borderBottom: "1px solid #ddd8cc" }}>
        <StarRating rating={recruit.starRating} size="sm" />
      </div>

      {/* Avatar */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #f8f4ec 0%, #ede8dc 100%)" }}>
        <PlayerAvatar
          skinTone={(recruit as unknown as Record<string, string>).skinTone ?? "medium"}
          playerId={recruit.id}
          size="md"
          className="w-16 h-16"
          jerseyColor={primaryColor}
          isRecruit={false}
        />
      </div>

      {/* Type badge */}
      <div style={{ display: "flex", justifyContent: "center", padding: "3px 6px", background: "#f0ebe0", flexShrink: 0 }}>
        <span
          className={`font-pixel ${badgePulse ? "animate-pulse" : ""}`}
          style={{ fontSize: "6px", padding: "2px 5px", borderRadius: "3px", background: badgeBg, color: badgeColor }}
          data-testid={`card-type-badge-${recruit.id}`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Name */}
      <div style={{ background: "#1a1a1a", padding: "3px 7px", flexShrink: 0 }}>
        <div className="font-pixel" style={{ fontSize: "7px", color: "#f5f0e6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recruit.firstName} {recruit.lastName}
        </div>
      </div>

      {/* Handedness */}
      <div style={{ background: "#111", padding: "2px 7px", flexShrink: 0 }}>
        <span style={{ fontSize: "7px", color: "#6b7280", fontFamily: "monospace" }}>
          B:{batHand} · T:{throwHand}
        </span>
      </div>

      {/* Location + OVR */}
      <div style={{ background: "#0d0d0d", padding: "3px 7px 5px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: "7px", color: "#9ca3af", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "88px" }}>
          {location}
        </span>
        <span className="font-pixel" style={{ fontSize: "10px", fontWeight: "bold", color: ovrColor, flexShrink: 0 }} data-testid={`card-ovr-${recruit.id}`}>
          {recruit.overall}
        </span>
      </div>
    </div>
  );
}

// ── RevealPortraitCard ─────────────────────────────────────────
// Flip card used in the signing day top row.
// Front = Power Pros portrait (light + position-family badge).
// Back  = existing CardBack (dark stat panel, unchanged).
function RevealPortraitCard({
  recruit,
  primaryColor,
  animationDelay = 0,
  disableAnimation = false,
  signingTeamAbbrev,
  signingTeamColor,
}: {
  recruit: RevealRecruit;
  primaryColor: string;
  animationDelay?: number;
  disableAnimation?: boolean;
  signingTeamAbbrev?: string;
  signingTeamColor?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  const isGenGem  = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust = !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  let cardBorder: string;
  let cardGlow: string;
  if (isGenGem) {
    cardBorder = "3px solid #FFD700";
    cardGlow   = "0 0 22px #FFD700, 0 0 44px #FFD70099, 0 0 70px #FFD70033";
  } else if (isGenBust) {
    cardBorder = "3px solid #7f1d1d";
    cardGlow   = "0 0 16px #7f1d1d, 0 0 32px #7f1d1d88";
  } else {
    const ovrBorder = getRevealOvrBorderColor(recruit.overall);
    const ovrGlow   = getRevealOvrGlow(recruit.overall);
    cardBorder = recruit.starRating >= 5
      ? `2px solid ${ovrBorder}`
      : recruit.starRating >= 4
        ? "2px solid #C4A35A"
        : "2px solid #d4c9a0";
    cardGlow = ovrGlow;
  }

  return (
    <div
      className="recruit-card-wrapper"
      style={{
        width: "160px",
        height: "220px",
        perspective: "800px",
        flexShrink: 0,
        animation: disableAnimation ? "none" : `cardSlideIn 0.5s ease-out ${animationDelay}s both`,
        cursor: "pointer",
      }}
      onClick={() => setFlipped(f => !f)}
      data-testid={`recruit-card-${recruit.id}`}
      title={flipped ? "Click to see front" : "Click to flip and see full profile"}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: disableAnimation ? "none" : "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          borderRadius: "8px",
          boxShadow: cardGlow,
          border: cardBorder,
        }}
      >
        {/* Front — Power Pros portrait */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <RevealCardFront recruit={recruit} primaryColor={primaryColor} signingTeamAbbrev={signingTeamAbbrev} signingTeamColor={signingTeamColor} />
        </div>
        {/* Back — existing dark stat panel */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <CardBack recruit={recruit} />
        </div>
      </div>
    </div>
  );
}

// ── LetterOfIntentCard removed — replaced by portrait-only layout ──
function _LetterOfIntentCard_UNUSED({
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

  // User's own team entry — drives fireworks color + gem ceremony
  const myTeamEntry = useMemo(
    () => data?.teamData?.find(t => t.team.id === data?.myTeamId) ?? data?.teamData?.[0] ?? null,
    [data?.teamData, data?.myTeamId]
  );
  const teamColor = myTeamEntry?.team.primaryColor ?? "#C4A35A";

  const revealedTeams = useRef<Set<string>>(new Set());

  // ── Build flat league-wide recruit list sorted ascending OVR ──
  const allLeagueRecruits = useMemo<LeagueRevealItem[]>(() => {
    if (!data?.teamData) return [];
    const items: LeagueRevealItem[] = data.teamData.flatMap(entry =>
      entry.recruits.map(r => ({
        ...r,
        signingTeamId: entry.team.id,
        signingTeamName: entry.team.name,
        signingTeamAbbreviation: entry.team.abbreviation,
        signingTeamPrimaryColor: entry.team.primaryColor,
        signingTeamSecondaryColor: entry.team.secondaryColor,
      }))
    );
    // Ascending by OVR — lowest first so the stars arrive last for drama
    return items.sort((a, b) => a.overall - b.overall);
  }, [data?.teamData]);

  // ── Cinematic phase state machine — fires once when data loads ──
  useEffect(() => {
    if (!data) return;
    if (reducedMotion) {
      setCinemaPhase("cards");
      return;
    }
    setCinemaPhase("buildup");
    const t1 = setTimeout(() => setCinemaPhase("burst"), 1500);
    const t2 = setTimeout(() => setCinemaPhase("cards"), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, reducedMotion]);

  // ── Fire reveal-complete for user's own team ──────────────────
  useEffect(() => {
    if (cinemaPhase !== "cards" || !data?.myTeamId || !leagueId) return;
    const teamId = data.myTeamId;
    if (revealedTeams.current.has(teamId)) return;
    revealedTeams.current.add(teamId);
    apiRequest("POST", `/api/leagues/${leagueId}/signing-day-reveal/complete?teamId=${teamId}`)
      .catch((err) => console.error("[reveal-complete] failed:", err));
  }, [cinemaPhase, data?.myTeamId, leagueId]);

  // ── Gem ceremony: user's own team only ───────────────────────
  const myTeamSortedRecruits = useMemo(
    () => [...(myTeamEntry?.recruits ?? [])].sort((a, b) => b.overall - a.overall),
    [myTeamEntry]
  );
  const gemRecruit = useMemo(
    () => (!reducedMotion ? (myTeamSortedRecruits.find(r => r.isGenerationalGem && r.gemBustRevealed) ?? null) : null),
    [myTeamSortedRecruits, reducedMotion]
  );

  // ── Reset gem phase on data change ────────────────────────────
  useEffect(() => {
    setGemPhase("waiting");
    setGemColorOverride(null);
  }, [data?.myTeamId]);

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
    if (!cardGridRef.current) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardGridRef.current, {
        backgroundColor: "#0d1f0d",
        scale: 2,
        logging: false,
        useCORS: true,
        onclone: (_doc, clonedEl) => {
          // html2canvas cannot render CSS 3D flip transforms (preserve-3d + rotateY).
          // Flatten all 3D containers and hide the invisible back faces so only the
          // front of each card is captured.
          clonedEl.querySelectorAll<HTMLElement>("[style]").forEach(el => {
            if (el.style.transformStyle === "preserve-3d") {
              el.style.transformStyle = "flat";
              el.style.transform = "none";
            }
            if (el.style.transform && el.style.transform.includes("rotateY(180deg)")) {
              el.style.display = "none";
            }
          });
        },
      });
      const link = document.createElement("a");
      link.download = `league-class-season-${data?.league.currentSeason ?? "unknown"}.png`;
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

  const showCards = cinemaPhase === "cards";

  return (
    <div className="relative min-h-screen bg-background">

      {/* ── Cinematic effect layers (fixed, not in html2canvas) ── */}
      {!reducedMotion && (
        <>
          <FireworksCanvas
            key="league-reveal"
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
            <p className="text-xs text-gray-400">
              Season {data?.league.currentSeason} · {allLeagueRecruits.length} total commits · Click any card to flip
            </p>
          </div>
          {showCards && allLeagueRecruits.length > 0 && (
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

        {/* ── League-wide card cinematic ── */}
        {showCards && allLeagueRecruits.length > 0 ? (
          <div>
            {/* Card grid — captured by html2canvas */}
            <div
              ref={cardGridRef}
              className="rounded-lg p-4"
              style={{ background: "#0d1f0d" }}
            >
              {/* League header */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#1a3a1a]">
                <Trophy className="w-6 h-6 text-[#C4A35A] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-pixel text-sm text-[#C4A35A]">{data?.league.name ?? "LEAGUE"} SIGNING CLASS</div>
                  <div className="text-xs text-gray-400">
                    Season {data?.league.currentSeason} · {allLeagueRecruits.length} commits across {data?.teamData?.filter(t => t.recruits.length > 0).length ?? 0} teams
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-pixel text-[10px] text-gray-500">SORTED LOWEST → HIGHEST OVR</div>
                </div>
              </div>

              {/* All recruits — ascending OVR, wrapped rows, each card shows team badge strip */}
              <div className="flex flex-wrap gap-2">
                {allLeagueRecruits.map((item, idx) => {
                  const animDelay = idx * 0.035;
                  const isSpecial = item.isBlueChip && !item.isGenerationalBust && !item.isGenerationalGem;
                  const isThisGem = !!(item.isGenerationalGem && item.gemBustRevealed && item.signingTeamId === data?.myTeamId);
                  return (
                    <div
                      key={item.id}
                      className="relative"
                      style={{
                        flexShrink: 0,
                        animation: isThisGem ? "sdGemSlideIn 0.7s ease-out both" : undefined,
                      }}
                      data-testid={isThisGem ? "gem-card-wrapper" : `card-wrapper-${item.id}`}
                    >
                      {!reducedMotion && (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            inset: -4, borderRadius: "10px", zIndex: 10,
                            animation: isSpecial || isThisGem
                              ? `sdShockwave 0.85s ease-out ${isThisGem ? 0.25 : animDelay + 0.55}s both`
                              : `sdSparkRing 0.5s ease-out ${animDelay + 0.45}s both`,
                          }}
                          aria-hidden
                        />
                      )}
                      {isThisGem && (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            inset: -3, borderRadius: "11px", zIndex: 8,
                            boxShadow: "0 0 18px 4px rgba(251,191,36,0.45), 0 0 38px 8px rgba(251,191,36,0.18)",
                          }}
                          aria-hidden
                        />
                      )}
                      <RevealPortraitCard
                        recruit={item}
                        primaryColor={item.signingTeamPrimaryColor}
                        animationDelay={isThisGem ? 0 : animDelay}
                        disableAnimation={reducedMotion && !isThisGem}
                        signingTeamAbbrev={item.signingTeamAbbreviation}
                        signingTeamColor={item.signingTeamPrimaryColor}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Gem ceremony label */}
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

            {/* League-wide stats bar */}
            <RetroCard className="mt-4">
              <RetroCardContent className="py-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  {[
                    { label: "Total",      value: allLeagueRecruits.length },
                    { label: "5-Star",     value: allLeagueRecruits.filter(r => r.starRating === 5).length },
                    { label: "4-Star",     value: allLeagueRecruits.filter(r => r.starRating === 4).length },
                    { label: "3-Star",     value: allLeagueRecruits.filter(r => r.starRating === 3).length },
                    { label: "Blue Chips", value: allLeagueRecruits.filter(r => r.isBlueChip).length },
                    { label: "Transfers",  value: allLeagueRecruits.filter(r => r.recruitType === "TRANSFER").length },
                    { label: "JUCO",       value: allLeagueRecruits.filter(r => r.recruitType === "JUCO").length },
                    { label: "Avg OVR",    value: allLeagueRecruits.length > 0 ? Math.round(allLeagueRecruits.reduce((s, r) => s + r.overall, 0) / allLeagueRecruits.length) : 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center min-w-[52px]">
                      <span className="font-pixel text-lg text-white">{value}</span>
                      <span className="text-[10px] text-gray-500">{label}</span>
                    </div>
                  ))}
                </div>
              </RetroCardContent>
            </RetroCard>

            {/* Post-reveal team class rankings */}
            {data && <PostRevealSummary teamData={data.teamData} myTeamId={data.myTeamId} currentSeason={data.league.currentSeason} />}
          </div>
        ) : !showCards && data ? (
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
            <p className="font-pixel text-sm">No signing class data available</p>
            <p className="text-xs mt-2">Check back once recruiting has ended</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PostRevealSummary ──────────────────────────────────────────
// Shown after the cinematic — team class rankings with expandable card grids.
function PostRevealSummary({
  teamData,
  myTeamId,
  currentSeason,
}: {
  teamData: TeamEntry[];
  myTeamId: string | null;
  currentSeason: number;
}) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(myTeamId);

  const rankedTeams = useMemo(
    () =>
      [...teamData]
        .filter(t => t.recruits.length > 0)
        .sort((a, b) => getClassScore(b.recruits) - getClassScore(a.recruits)),
    [teamData]
  );

  if (rankedTeams.length === 0) return null;

  return (
    <div className="mt-8" data-testid="post-reveal-summary">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#1a3a1a]">
        <Trophy className="w-4 h-4 text-[#C4A35A]" />
        <h2 className="font-pixel text-[#C4A35A] text-xs tracking-widest">
          CLASS RANKINGS — SEASON {currentSeason}
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {rankedTeams.map((entry, idx) => {
          const rank = idx + 1;
          const isExpanded = expandedTeam === entry.team.id;
          const isMyTeam = entry.team.id === myTeamId;
          const sortedRecruits = [...entry.recruits].sort((a, b) => b.overall - a.overall);
          const avgOvr = Math.round(entry.recruits.reduce((s, r) => s + r.overall, 0) / entry.recruits.length);
          const fiveStars = entry.recruits.filter(r => r.starRating >= 5).length;
          const fourStars = entry.recruits.filter(r => r.starRating >= 4 && r.starRating < 5).length;

          return (
            <div
              key={entry.team.id}
              className="border rounded-lg overflow-hidden"
              style={{ borderColor: isMyTeam ? entry.team.primaryColor + "55" : "#1a3a1a" }}
            >
              <button
                className="w-full flex items-center gap-3 p-3 text-left hover:opacity-90 transition-opacity"
                style={{ background: isMyTeam ? `${entry.team.primaryColor}14` : "#0a180a" }}
                onClick={() => setExpandedTeam(isExpanded ? null : entry.team.id)}
                data-testid={`summary-team-${entry.team.abbreviation}`}
              >
                <span
                  className="font-pixel text-base shrink-0"
                  style={{
                    color: rank === 1 ? "#C4A35A" : rank <= 3 ? "#facc15" : "#6b7280",
                    minWidth: "32px",
                  }}
                >
                  #{rank}
                </span>
                <TeamBadge
                  abbreviation={entry.team.abbreviation}
                  primaryColor={entry.team.primaryColor}
                  secondaryColor={entry.team.secondaryColor}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">{entry.team.name}</span>
                    {isMyTeam && <span className="text-[10px] font-pixel text-[#C4A35A]">(You)</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {entry.recruits.length} commits · Avg OVR {avgOvr}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {fiveStars > 0 && <span className="text-red-400">{fiveStars}×5★</span>}
                  {fourStars > 0 && <span className="text-yellow-400">{fourStars}×4★</span>}
                  <span className="text-gray-500 text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>
              {isExpanded && (
                <div
                  className="p-3 border-t overflow-x-auto"
                  style={{ borderColor: "#1a3a1a", background: "#0d1f0d" }}
                >
                  <div className="flex flex-wrap gap-2">
                    {sortedRecruits.map(r => (
                      <RevealPortraitCard
                        key={r.id}
                        recruit={r}
                        primaryColor={entry.team.primaryColor}
                        disableAnimation
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
