import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import type { RevealRecruit } from "@/components/recruit-card";
import { StarRating } from "@/components/ui/star-rating";
import { PlayerAvatar } from "@/components/player-avatar";
import { ArrowLeft, ArrowRight, Crown, Download, Trophy, ChevronRight, X } from "lucide-react";
import { isPitcher, isCatcher } from "@shared/positions";
import { getAbilityByName } from "@shared/abilities";
import { getPotentialGrade } from "@shared/potential";
import { LetterGrade } from "@/components/ui/letter-grade";

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

// ── Reveal tier for card border/glow intensity ─────────────────
type RevealTier = "generational" | "program-changer" | "blue-chip" | "impact" | "standard";

function getRevealTier(recruit: RevealRecruit): RevealTier {
  if (recruit.isGenerationalGem && recruit.gemBustRevealed) return "generational";
  if (recruit.starRating >= 5 || recruit.overall >= 550 || recruit.isBlueChip) return "program-changer";
  if (recruit.starRating >= 4 || recruit.overall >= 400) return "blue-chip";
  if (recruit.overall >= 300) return "impact";
  return "standard";
}

// ── Projection label (no "BUST" or "GEN BUST" language) ────────
function getProjectionLabel(recruit: RevealRecruit): string {
  if (recruit.isGenerationalGem && recruit.gemBustRevealed) return "Generational Talent";
  if (recruit.isGenerationalBust && recruit.gemBustRevealed) return "Raw Tools";
  if (recruit.isGem && recruit.gemBustRevealed) return "Exceeded Projection";
  if (recruit.isBust && recruit.gemBustRevealed) return "Developmental Projection";
  if (recruit.recruitType === "TRANSFER") return "Transfer Impact";
  if (recruit.recruitType === "JUCO") return "JUCO Ready";
  if (recruit.recruitType === "STORYLINE") return "Storyline Recruit";
  if (recruit.isBlueChip) return "Blue Chip";
  if (recruit.starRating >= 5) return "Program Changer";
  if (recruit.starRating >= 4) return "Impact Freshman";
  return "Signed Recruit";
}

// ── Top tool for the hero spotlight ────────────────────────────
function getTopTool(recruit: RevealRecruit): { label: string; val: number } | null {
  const pitcher = isPitcher(recruit.position);
  const attrs = pitcher ? [
    { label: "Velocity", val: recruit.velocity ?? 0 },
    { label: "Control",  val: recruit.control  ?? 0 },
    { label: "Stuff",    val: recruit.stuff     ?? 0 },
    { label: "Stamina",  val: recruit.stamina   ?? 0 },
  ] : [
    { label: "Contact",  val: recruit.hitForAvg ?? 0 },
    { label: "Power",    val: recruit.power     ?? 0 },
    { label: "Speed",    val: recruit.speed     ?? 0 },
    { label: "Fielding", val: recruit.fielding  ?? 0 },
  ];
  if (!attrs.length) return null;
  const top = attrs.reduce((best, a) => (a.val > best.val ? a : best), attrs[0]);
  return top.val > 0 ? top : null;
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
  if (position === "P")                           return "#dc2626";
  if (position === "C")                           return "#1c1c1c";
  if (["1B","2B","3B","SS"].includes(position))   return "#2563eb";
  if (position === "OF")                          return "#16a34a";
  if (position === "DH")                          return "#7c3aed";
  return "#6b7280";
}

// ── OVR helpers ────────────────────────────────────────────────
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
  const isGen    = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust= !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  // Type badge — no "BUST" or "GEN BUST" labels on card faces
  let badgeLabel = "RAW";
  let badgeBg    = "#374151";
  let badgeColor = "#9ca3af";
  let badgePulse = false;
  if (isGen) {
    badgeLabel = "GEN TALENT ✦"; badgeBg = "#92400e"; badgeColor = "#fbbf24"; badgePulse = true;
  } else if (isGenBust) {
    badgeLabel = "RAW TOOLS ✦"; badgeBg = "#4c1d1d"; badgeColor = "#fca5a5"; badgePulse = true;
  } else if (recruit.isGem && recruit.gemBustRevealed) {
    badgeLabel = "EXCEEDED"; badgeBg = "#065f46"; badgeColor = "#6ee7b7";
  } else if (recruit.isBust && recruit.gemBustRevealed) {
    badgeLabel = "DEVELOPMENTAL"; badgeBg = "#1e293b"; badgeColor = "#94a3b8";
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
  const potGrade  = recruit.potential ? getPotentialGrade(recruit.potential) : null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8f4ec", borderRadius: "6px", overflow: "hidden" }}>

      {/* Team strip */}
      {signingTeamAbbrev && (
        <div style={{
          background: signingTeamColor || primaryColor,
          height: "18px",
          display: "flex",
          alignItems: "center",
          padding: "0 7px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(0,0,0,0.2)",
        }}>
          <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#fff", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {signingTeamAbbrev}
          </span>
        </div>
      )}

      {/* Position + Class Rank strip */}
      <div style={{ background: posColor, height: "28px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 9px", flexShrink: 0 }}>
        <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#fff", fontWeight: "bold" }} data-testid={`card-position-${recruit.id}`}>
          {recruit.position}
        </span>
        <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: "3px" }}>
          {recruit.isBlueChip && !isGen && !isGenBust && <Crown style={{ width: "12px", height: "12px" }} />}
          {recruit.classRank > 0 ? `#${recruit.classRank}` : ""}
        </span>
      </div>

      {/* Stars */}
      <div style={{ height: "22px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#f0ebe0", borderBottom: "1px solid #ddd8cc" }}>
        <StarRating rating={recruit.starRating} size="sm" />
      </div>

      {/* Avatar */}
      <div style={{ height: "80px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #f8f4ec 0%, #ede8dc 100%)", overflow: "hidden" }}>
        <PlayerAvatar
          skinTone={(recruit as unknown as Record<string, string>).skinTone ?? "medium"}
          playerId={recruit.id}
          size="lg"
          jerseyColor={primaryColor}
          isRecruit={false}
        />
      </div>

      {/* Type badge */}
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 8px", background: "#f0ebe0", flexShrink: 0 }}>
        <span
          className={`${badgePulse ? "animate-pulse" : ""}`}
          style={{ fontSize: "12px", padding: "3px 7px", borderRadius: "3px", background: badgeBg, color: badgeColor }}
          data-testid={`card-type-badge-${recruit.id}`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Name */}
      <div style={{ background: "#1a1a1a", padding: "4px 9px", flexShrink: 0 }}>
        <div className="font-sans font-semibold" style={{ fontSize: "12px", color: "#f5f0e6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recruit.firstName} {recruit.lastName}
        </div>
      </div>

      {/* OVR + POT block */}
      <div style={{ flex: 1, background: "#111", padding: "6px 9px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span
            className="font-sans font-semibold"
            style={{
              fontSize: "22px",
              color: "#C4A35A",
              lineHeight: 1,
              textShadow: recruit.starRating >= 5
                ? "0 0 10px rgba(196,163,90,0.9), 0 0 24px rgba(196,163,90,0.5)"
                : recruit.starRating >= 4
                ? "0 0 8px rgba(196,163,90,0.65)"
                : undefined,
            }}
            data-testid={`card-ovr-${recruit.id}`}
          >
            {recruit.overall}
          </span>
          <span style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1 }}>OVR</span>
        </div>
        {potGrade && (
          <div style={{ display: "flex", alignItems: "baseline", gap: "3px" }}>
            <span className="font-sans font-semibold" style={{ fontSize: "15px", color: "#a78bfa", lineHeight: 1 }}>{potGrade}</span>
            <span style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1 }}>POT</span>
          </div>
        )}
      </div>

      {/* Handedness + Location */}
      <div style={{ background: "#0d0d0d", padding: "4px 9px 6px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ fontSize: "12px", color: "#6b7280", fontFamily: "monospace" }}>B:{batHand} · T:{throwHand}</span>
          <span className="font-sans font-semibold" style={{ fontSize: "12px", fontWeight: "bold", color: "#C4A35A" }} data-testid={`card-pos-rank-${recruit.id}`}>
            #{recruit.positionRank} {recruit.position}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {location}
        </span>
      </div>
    </div>
  );
}

// ── BattleReportModal ──────────────────────────────────────────
function BattleReportModal({ recruit, onClose }: { recruit: RevealRecruit; onClose: () => void }) {
  const r = recruit.recruitingResult;
  if (!r) return null;

  const myA = r.myActions;
  const actionItems: { label: string; value: string | number | boolean }[] = myA ? [
    { label: "Emails",        value: myA.email },
    { label: "Phone Calls",   value: myA.phone },
    { label: "Campus Visit",  value: myA.visit ? "Yes" : "No" },
    { label: "HC Visit",      value: myA.headCoachVisit ? "Yes" : "No" },
    { label: "Scholarship",   value: myA.offer ? "Yes" : "No" },
    { label: "Scout Actions", value: myA.scout },
    { label: "Total % Gained", value: myA.totalGained != null ? `${myA.totalGained.toFixed(1)}%` : "—" },
  ] : [];

  const didWin = r.viewerOutcome === "won";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)" }}
      onClick={onClose}
      data-testid="battle-report-modal-backdrop"
    >
      <div
        className="relative w-full max-w-md rounded-lg overflow-hidden"
        style={{ background: "#0a1a0a", border: "2px solid #C4A35A44", boxShadow: "0 0 40px #C4A35A22" }}
        onClick={e => e.stopPropagation()}
        data-testid="battle-report-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a3a1a]">
          <div>
            <div className="text-xs font-semibold text-[#C4A35A]">BATTLE REPORT</div>
            <div className="text-xs text-gray-400 mt-0.5">{recruit.firstName} {recruit.lastName} · {recruit.position} · {recruit.starRating}★</div>
          </div>
          <button
            className="text-gray-600 hover:text-gray-300 transition-colors"
            onClick={onClose}
            data-testid="button-close-battle-report"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Outcome banner */}
          <div
            className="rounded p-3 text-center"
            style={{ background: didWin ? "#0f2a0f" : "#1a0a0a", border: `1px solid ${didWin ? "#2a6a2a" : "#6a1a1a"}` }}
            data-testid="battle-report-outcome"
          >
            <div className={`text-[0.8125rem] font-semibold ${didWin ? "text-[#C4A35A]" : "text-gray-400"}`}>
              {recruit.signedTeamId == null ? "UNSIGNED" : didWin ? "SIGNED" : "LOST"}
            </div>
            {r.finalInterest != null && (
              <div className="text-xs text-gray-500 mt-1">
                Final interest: {r.finalInterest.toFixed(1)}%
                {r.wonBy != null && r.wonBy > 0 && (
                  <span className="text-green-500 ml-2">+{r.wonBy.toFixed(1)}% ahead of #{2} school</span>
                )}
              </div>
            )}
            {r.offerWeek != null && (
              <div className="text-xs text-gray-600 mt-0.5">Offer extended: Week {r.offerWeek}</div>
            )}
          </div>

          {/* Competition breakdown */}
          {r.topSchools.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase mb-2 tracking-wide">Top Schools</div>
              <div className="space-y-1.5">
                {r.topSchools.map((ts, i) => (
                  <div
                    key={ts.teamId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded"
                    style={{ background: i === 0 ? "#0f2a0f" : "#111" }}
                    data-testid={`battle-school-${i}`}
                  >
                    <span className="text-xs font-semibold text-gray-600 w-4">#{i + 1}</span>
                    <span className="text-xs text-white flex-1 truncate">{ts.teamName}</span>
                    {ts.hadOffer && (
                      <span className="text-xs text-[#C4A35A] border border-[#C4A35A]/30 rounded px-1 py-0.5">OFFER</span>
                    )}
                    <span className="text-xs font-semibold text-gray-400 w-12 text-right">
                      {ts.interestLevel.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My actions breakdown */}
          {myA && (
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase mb-2 tracking-wide">Your Recruiting Actions</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {actionItems.map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-xs py-0.5 border-b border-[#1a2e1a]">
                    <span className="text-gray-500">{label}</span>
                    <span className="text-white font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NIL cost */}
          {r.nilCost > 0 && (
            <div className="flex justify-between text-xs px-1">
              <span className="text-gray-500">NIL Cost</span>
              <span className="text-[#C4A35A] text-xs font-semibold">${r.nilCost.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── RevealCardBack ─────────────────────────────────────────────
function RevealCardBack({ recruit, onBattleReport }: { recruit: RevealRecruit; onBattleReport?: () => void }) {
  const pitcher = isPitcher(recruit.position);
  const catcher = isCatcher(recruit.position);

  const ABILITY_TO_ATTR: Record<string, string> = {
    "Gambler":             "clutch",
    "Lefty Arm Killer":    "vsLHP",
    "Express Baserunning": "running",
    "Lightning Speed":     "stealing",
    "Strike Thrower":      "throwing",
    "Bazooka Arm":         "throwing",
    "The Almanac":         "catcherAbility",
    "Iron Man":            "grit",
    "Big Boy Speed":       "heater",
    "Indomitable Soul":    "poise",
    "Sangfroid":           "wRISP",
    "Lefty Killer":        "vsLefty",
    "Gas Tank":            "recovery",
    "Halting Quickness":   "agile",
    "Grit":                "grit",
  };

  const recruitAbilities = recruit.abilities ?? [];
  const attrToAbility: Record<string, string> = {};
  for (const name of recruitAbilities) {
    const k = ABILITY_TO_ATTR[name];
    if (k && !attrToAbility[k]) attrToAbility[k] = name;
  }

  const primaryAttrs: { label: string; val: number }[] = pitcher ? [
    { label: "Velocity", val: recruit.velocity ?? 50 },
    { label: "Control",  val: recruit.control ?? 50 },
    { label: "Stamina",  val: recruit.stamina ?? 50 },
    { label: "Stuff",    val: recruit.stuff ?? 50 },
    { label: "Arm",      val: recruit.arm ?? 50 },
    { label: "Error",    val: recruit.errorResistance ?? 50 },
  ] : [
    { label: "Contact",  val: recruit.hitForAvg ?? 50 },
    { label: "Power",    val: recruit.power ?? 50 },
    { label: "Speed",    val: recruit.speed ?? 50 },
    { label: "Arm",      val: recruit.arm ?? 50 },
    { label: "Fielding", val: recruit.fielding ?? 50 },
    { label: "Error",    val: recruit.errorResistance ?? 50 },
  ];

  type CA = { label: string; val: number; key: string };
  const commonAbils: CA[] = pitcher ? [
    { label: "W/RISP",   val: recruit.wRISP ?? 50,    key: "wRISP" },
    { label: "vs Lefty", val: recruit.vsLefty ?? 50,  key: "vsLefty" },
    { label: "Poise",    val: recruit.poise ?? 50,    key: "poise" },
    { label: "Grit",     val: recruit.grit ?? 50,     key: "grit" },
    { label: "Heater",   val: recruit.heater ?? 50,   key: "heater" },
    { label: "Agile",    val: recruit.agile ?? 50,    key: "agile" },
    { label: "Recovery", val: recruit.recovery ?? 50, key: "recovery" },
  ] : [
    { label: "Clutch",   val: recruit.clutch ?? 50,    key: "clutch" },
    { label: "vs LHP",   val: recruit.vsLHP ?? 50,     key: "vsLHP" },
    { label: "Grit",     val: recruit.grit ?? 50,      key: "grit" },
    { label: "Stealing", val: recruit.stealing ?? 50,  key: "stealing" },
    { label: "Running",  val: recruit.running ?? 50,   key: "running" },
    { label: "Throwing", val: recruit.throwing ?? 50,  key: "throwing" },
    ...(catcher ? [{ label: "Catcher", val: recruit.catcherAbility ?? 50, key: "catcherAbility" }] : []),
  ];

  const specialAbilities = recruitAbilities.filter(name => {
    const a = getAbilityByName(name);
    return a && (a.tier === "gold" || a.tier === "blue" || a.tier === "red");
  });

  const potGrade = recruit.potential ? getPotentialGrade(recruit.potential) : "?";
  const isGen     = !!(recruit.isGenerationalGem  && recruit.gemBustRevealed);
  const isGenBust = !!(recruit.isGenerationalBust && recruit.gemBustRevealed);

  // Back-side badge labels — also no raw "BUST" language
  let badgeLabel = "RAW";
  let badgeBg    = "#374151";
  let badgeColor = "#9ca3af";
  let badgePulse = false;
  if (isGen) {
    badgeLabel = "GEN TALENT ✦"; badgeBg = "#92400e"; badgeColor = "#fbbf24"; badgePulse = true;
  } else if (isGenBust) {
    badgeLabel = "RAW TOOLS ✦"; badgeBg = "#4c1d1d"; badgeColor = "#fca5a5"; badgePulse = true;
  } else if (recruit.isGem && recruit.gemBustRevealed) {
    badgeLabel = "EXCEEDED"; badgeBg = "#065f46"; badgeColor = "#6ee7b7";
  } else if (recruit.isBust && recruit.gemBustRevealed) {
    badgeLabel = "DEVELOPMENTAL"; badgeBg = "#1e293b"; badgeColor = "#94a3b8";
  } else if (recruit.recruitType === "STORYLINE") {
    badgeLabel = "STORYLINE"; badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "TRANSFER") {
    badgeLabel = recruit.fromTeamName ? `XFER·${recruit.fromTeamName.slice(0, 7)}` : "TRANSFER";
    badgeBg = "#5b21b6"; badgeColor = "#ddd6fe";
  } else if (recruit.recruitType === "JUCO") {
    badgeLabel = recruit.fromTeamName ? `JUCO·${recruit.fromTeamName.slice(0, 7)}` : "JUCO";
    badgeBg = "#0e7490"; badgeColor = "#a5f3fc";
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0d1f0d 0%, #162616 50%, #1a2e1a 100%)", borderRadius: "8px" }}
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-[#2d3d2d] shrink-0">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#C4A35A] truncate leading-tight">
              {recruit.firstName} {recruit.lastName}
            </div>
            <div className="text-xs text-gray-500 leading-tight mt-0.5">
              {recruit.position} · T:{recruit.throwHand ?? "R"} · B:{recruit.batHand ?? "R"}
            </div>
          </div>
          <StarRating rating={recruit.starRating} size="sm" />
        </div>
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-[18px] font-bold text-[#C4A35A] leading-none tabular-nums">{recruit.overall}</span>
            <span className="text-xs text-gray-500 leading-none">OVR</span>
          </div>
          {potGrade && (
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] font-bold text-purple-400 leading-none">{potGrade}</span>
              <span className="text-xs text-gray-500 leading-none">POT</span>
            </div>
          )}
        </div>
      </div>

      {/* Type badge + blue chip */}
      <div className="px-2.5 pt-1 pb-0.5 flex items-center gap-1 flex-wrap shrink-0">
        <span
          className={`text-xs px-1.5 py-0.5 rounded leading-none ${badgePulse ? "animate-pulse" : ""}`}
          style={{ background: badgeBg, color: badgeColor }}
        >
          {badgeLabel}
        </span>
        {recruit.isBlueChip && !isGen && !isGenBust && (
          <span className="text-xs text-blue-400 flex items-center gap-0.5 leading-none">
            <Crown className="w-3 h-3" />BLUE CHIP
          </span>
        )}
      </div>

      {/* ATTRIBUTES */}
      <div className="px-2.5 pt-1 pb-0.5 border-t border-[#2d3d2d] shrink-0">
        <div className="text-xs font-semibold text-gray-600 uppercase mb-1 leading-none tracking-wide">ATTRIBUTES</div>
        <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5">
          {primaryAttrs.map(({ label, val }) => (
            <div key={label} className="flex items-center justify-between bg-[#0a1a0a] rounded px-1.5 py-0.5 gap-1">
              <span className="text-xs text-gray-500 leading-none shrink-0">{label}</span>
              <div className="flex items-center gap-1 shrink-0">
                <LetterGrade value={val} size="sm" />
                <span className="text-xs text-gray-400 leading-none w-[18px] text-right tabular-nums">{val}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* COMMON ABILITIES */}
      <div className="px-2.5 pt-1 pb-0.5 border-t border-[#1a2e1a] shrink-0">
        <div className="text-xs font-semibold text-gray-600 uppercase mb-1 leading-none tracking-wide">COMMON ABILITIES</div>
        <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5">
          {commonAbils.map(({ label, val, key }) => {
            const abilName = attrToAbility[key];
            return (
              <div key={label} className="flex items-center justify-between bg-[#0a1a0a] rounded px-1.5 py-0.5 gap-1">
                <span className="text-xs text-gray-500 leading-none shrink-0">{label}</span>
                <div className="flex items-center gap-1 shrink-0 min-w-0">
                  {abilName && (
                    <span className="text-xs text-amber-400/80 truncate leading-none max-w-[52px]">
                      {abilName.length > 8 ? abilName.slice(0, 8) + "…" : abilName}
                    </span>
                  )}
                  <LetterGrade value={val} size="sm" isCommonAbility={true} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SPECIAL ABILITIES */}
      <div className="px-2.5 pt-1 pb-1.5 border-t border-[#1a2e1a] flex-1 min-h-0">
        <div className="text-xs font-semibold text-gray-600 uppercase mb-1 leading-none tracking-wide">SPECIAL ABILITIES</div>
        {specialAbilities.length === 0 ? (
          <div className="text-xs text-gray-600 italic">None</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {specialAbilities.slice(0, 5).map(name => {
              const a = getAbilityByName(name);
              if (!a) return null;
              const tierColor = a.tier === "gold"
                ? "text-amber-400 border-amber-500/40"
                : a.tier === "blue"
                ? "text-blue-400 border-blue-500/40"
                : "text-red-400 border-red-500/40";
              return (
                <span key={name} className={`text-xs border rounded px-1 py-0.5 leading-tight ${tierColor}`}>
                  {name.length > 11 ? name.slice(0, 11) + "…" : name}
                </span>
              );
            })}
            {specialAbilities.length > 5 && (
              <span className="text-xs text-gray-500 leading-none">+{specialAbilities.length - 5} more</span>
            )}
          </div>
        )}
      </div>

      {/* Battle Report button — only when analytics are available */}
      {onBattleReport && recruit.recruitingResult && (
        <button
          className="mx-2.5 mb-2 shrink-0 w-[calc(100%-20px)] text-xs text-[#C4A35A] border border-[#C4A35A]/30 rounded py-1 hover:bg-[#C4A35A]/10 transition-colors"
          onClick={e => { e.stopPropagation(); onBattleReport(); }}
          data-testid="button-battle-report"
        >
          View Battle Report
        </button>
      )}
    </div>
  );
}

// ── RevealPortraitCard ─────────────────────────────────────────
function RevealPortraitCard({
  recruit,
  primaryColor,
  animationDelay = 0,
  disableAnimation = false,
  signingTeamAbbrev,
  signingTeamColor,
  cardWidth = 210,
  cardHeight = 290,
  onBattleReport,
}: {
  recruit: RevealRecruit;
  primaryColor: string;
  animationDelay?: number;
  disableAnimation?: boolean;
  signingTeamAbbrev?: string;
  signingTeamColor?: string;
  cardWidth?: number;
  cardHeight?: number;
  onBattleReport?: () => void;
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
    cardBorder = "3px solid #4c1d1d";
    cardGlow   = "0 0 16px #4c1d1d, 0 0 32px #4c1d1d88";
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
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        perspective: "1000px",
        flexShrink: 0,
        animation: disableAnimation ? "none" : `cardSlideIn 0.5s ease-out ${animationDelay}s both`,
        cursor: "pointer",
      }}
      onClick={() => {
        if (!flipped) {
          import("@/lib/sfx").then(m => m.playOfferSfx()).catch(() => {});
        }
        setFlipped(f => !f);
      }}
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
        {/* Front */}
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
        {/* Back */}
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
          <RevealCardBack recruit={recruit} onBattleReport={onBattleReport} />
        </div>
      </div>
    </div>
  );
}

// ── SealedCard ─────────────────────────────────────────────────
// Sealed Letter of Intent card — shows silhouette + position hint.
// Border intensity hints at rarity without revealing OVR.
function SealedCard({
  recruit,
  onReveal,
  animationDelay = 0,
  reducedMotion = false,
}: {
  recruit: RevealRecruit;
  onReveal: () => void;
  animationDelay?: number;
  reducedMotion?: boolean;
}) {
  const tier = getRevealTier(recruit);
  const posColor = getPositionFamilyColor(recruit.position);

  const borderStyle: React.CSSProperties =
    tier === "generational"
      ? { border: "2.5px solid #FFD700", boxShadow: "0 0 12px rgba(255,215,0,0.4)" }
      : tier === "program-changer"
      ? { border: "2px solid #C4A35A", boxShadow: "0 0 8px rgba(196,163,90,0.35)" }
      : tier === "blue-chip"
      ? { border: "2px solid #60a5fa", boxShadow: "0 0 6px rgba(96,165,250,0.25)" }
      : tier === "impact"
      ? { border: "2px solid #6b7280" }
      : { border: "2px solid #d4c9a0" };

  return (
    <div
      className="group cursor-pointer select-none"
      style={{
        width: "200px",
        height: "280px",
        flexShrink: 0,
        position: "relative",
        borderRadius: "8px",
        background: "#f8f4ec",
        overflow: "hidden",
        animation: reducedMotion ? "none" : `loiCardSlideUp 0.5s ease-out ${animationDelay}s both`,
        ...borderStyle,
      }}
      onClick={onReveal}
      data-testid={`sealed-card-${recruit.id}`}
      title="Click to reveal"
    >
      {/* Header */}
      <div style={{ background: "#1a1a1a", padding: "5px 8px", textAlign: "center" }}>
        <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#e5c97a", letterSpacing: "0.12em" }}>
          LETTER OF INTENT
        </span>
      </div>

      {/* Position strip */}
      <div style={{ background: posColor, height: "20px", display: "flex", alignItems: "center", paddingLeft: "8px" }}>
        <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#fff", fontWeight: "bold" }}>{recruit.position}</span>
      </div>

      {/* Silhouette area */}
      <div style={{ height: "96px", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0ebe0", padding: "8px" }}>
        <div style={{ width: "88px", height: "96px", background: "#d8d3ca", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #c4bfb4" }}>
          <svg viewBox="0 0 40 52" width="68" height="88" aria-hidden>
            <ellipse cx="20" cy="12" rx="8" ry="9" fill="#b8b4ac" />
            <path d="M5 52 Q5 32 20 29 Q35 32 35 52 Z" fill="#b8b4ac" />
            <path d="M17 29 Q20 33 23 29" fill="none" stroke="#a8a49c" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {/* State hint */}
      <div style={{ background: "#f0ebe0", padding: "4px 8px", borderTop: "1px solid #ddd8cc" }}>
        <span style={{ fontSize: "12px", color: "#888", fontFamily: "monospace" }}>{recruit.homeState}</span>
      </div>

      {/* Signed stamp */}
      <div style={{ padding: "6px 8px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8f4ec" }}>
        <StarRating rating={recruit.starRating} size="sm" />
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2.5px solid #b91c1c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(185,28,28,0.06)", gap: 1, flexShrink: 0 }}>
          <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#b91c1c", textAlign: "center", lineHeight: 1.2 }}>SIGNED</span>
          <span className="font-sans font-semibold" style={{ fontSize: "12px", color: "#b91c1c", lineHeight: 1 }}>NLI</span>
        </div>
      </div>

      {/* Hover reveal overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100"
        style={{ background: "rgba(0,0,0,0.42)", borderRadius: "6px" }}
      >
        <div className="flex flex-col items-center gap-1">
          <ChevronRight className="w-5 h-5 text-[#C4A35A]" />
          <span className="text-[#C4A35A] text-xs">REVEAL</span>
        </div>
      </div>
    </div>
  );
}

// ── RevealIntroLobby ───────────────────────────────────────────
// Full-screen lobby shown before the sealed card grid.
function RevealIntroLobby({
  teamEntry,
  season,
  recruitCount,
  reducedMotion,
  onStart,
  onSkip,
}: {
  teamEntry: TeamEntry | null;
  season: number;
  recruitCount: number;
  reducedMotion: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-6"
      style={{ background: "linear-gradient(180deg, #050e05 0%, #0a180a 50%, #0d2010 100%)" }}
      data-testid="reveal-lobby"
    >
      {/* Subtle star field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        {[...Array(24)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() < 0.3 ? "2px" : "1px",
              height: Math.random() < 0.3 ? "2px" : "1px",
              top: `${Math.random() * 80}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.15 + Math.random() * 0.3,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md w-full">
        {/* Team badge */}
        {teamEntry && (
          <div className="mb-2">
            <TeamBadge
              abbreviation={teamEntry.team.abbreviation}
              primaryColor={teamEntry.team.primaryColor}
              secondaryColor={teamEntry.team.secondaryColor}
              size="lg"
            />
          </div>
        )}

        {/* Season label */}
        <div className="text-xs font-semibold text-[#C4A35A]/50 tracking-[0.25em]">
          SEASON {season} · SIGNING DAY
        </div>

        {/* Headline */}
        <div>
          <h1
            className="text-[#C4A35A] leading-relaxed"
            style={{ fontSize: "clamp(18px, 4vw, 28px)", textShadow: "0 0 24px rgba(196,163,90,0.45), 0 0 48px rgba(196,163,90,0.2)" }}
          >
            Your class is sealed.
          </h1>
          {teamEntry && (
            <div className="text-xs font-semibold text-white/50 mt-2">
              {teamEntry.team.name} Recruiting Class
            </div>
          )}
        </div>

        {/* Sub-copy */}
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
          Open your letters of intent one by one to reveal the future of your program.
        </p>

        {/* Count */}
        <div
          className="text-xs font-semibold tracking-widest px-4 py-2 rounded border"
          style={{ color: "#C4A35A", borderColor: "#C4A35A33", background: "rgba(196,163,90,0.06)" }}
        >
          {recruitCount} SIGNED RECRUIT{recruitCount !== 1 ? "S" : ""}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
          <RetroButton
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={onStart}
            data-testid="button-start-reveal"
          >
            Open Letters
          </RetroButton>
          <RetroButton
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onSkip}
            data-testid="button-skip-reveal"
          >
            Skip to Results
          </RetroButton>
        </div>

        {reducedMotion && (
          <div className="text-xs text-gray-600 mt-1">Reduced motion active — skipping animations</div>
        )}
      </div>
    </div>
  );
}

// ── HeroSpotlight ──────────────────────────────────────────────
// Full-screen overlay shown when an elite recruit card is revealed.
function HeroSpotlight({
  recruit,
  primaryColor,
  onClose,
}: {
  recruit: RevealRecruit;
  primaryColor: string;
  onClose: () => void;
}) {
  const potGrade = recruit.potential ? getPotentialGrade(recruit.potential) : null;
  const label    = getProjectionLabel(recruit);
  const topTool  = getTopTool(recruit);
  const tier     = getRevealTier(recruit);
  const topAbility = (recruit.abilities ?? []).find(name => {
    const a = getAbilityByName(name);
    return a && a.tier === "gold";
  }) ?? (recruit.abilities ?? [])[0] ?? null;

  const glowColor =
    tier === "generational"   ? "#FFD700" :
    tier === "program-changer"? "#C4A35A" : "#60a5fa";

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
      data-testid="hero-spotlight"
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "500px", height: "500px",
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${glowColor}22 0%, transparent 70%)`,
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
        }}
        aria-hidden
      />

      <div
        className="relative flex flex-col items-center gap-4 p-6 cursor-pointer"
        style={{ maxWidth: "360px", width: "90vw" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Tier label */}
        <div
          className="text-xs font-semibold tracking-[0.2em] px-3 py-1 rounded"
          style={{ color: glowColor, background: `${glowColor}18`, border: `1px solid ${glowColor}44` }}
        >
          {label.toUpperCase()}
        </div>

        {/* Player name */}
        <div className="text-center">
          <div className="text-white text-sm leading-tight">
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="text-xs text-gray-500 mt-1">{recruit.position} · {recruit.homeState}</div>
        </div>

        {/* Portrait card */}
        <div style={{ filter: `drop-shadow(0 0 20px ${glowColor}55)` }}>
          <RevealPortraitCard
            recruit={recruit}
            primaryColor={primaryColor}
            disableAnimation
            cardWidth={220}
            cardHeight={300}
          />
        </div>

        {/* Stat row */}
        <div className="flex gap-5 text-center">
          <div>
            <div className="font-display text-xl font-bold leading-none" style={{ color: glowColor }}>{recruit.overall}</div>
            <div className="text-xs text-gray-500 mt-1">OVR</div>
          </div>
          {potGrade && (
            <div>
              <div className="font-display text-xl font-bold text-purple-400 leading-none">{potGrade}</div>
              <div className="text-xs text-gray-500 mt-1">POT</div>
            </div>
          )}
          {topTool && (
            <div>
              <div className="font-display text-xl font-bold text-white leading-none">{topTool.val}</div>
              <div className="text-xs text-gray-500 mt-1">{topTool.label}</div>
            </div>
          )}
        </div>

        {/* Top special ability */}
        {topAbility && (
          <div className="text-xs font-semibold text-amber-400 tracking-widest">
            {topAbility}
          </div>
        )}

        <button
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-1"
          onClick={onClose}
          data-testid="button-close-hero-spotlight"
        >
          tap to continue
        </button>
      </div>
    </div>
  );
}

// ── SigningDayRevealPage ───────────────────────────────────────
type CinemaPhase = "lobby" | "sealed" | "cards";
type GemPhase = "waiting" | "spotlight" | "burst" | "revealed";
type SigningTab = "my-class" | "all-teams" | "all-recruits";

export default function SigningDayRevealPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const [isDownloading, setIsDownloading] = useState(false);
  const cardGridRef = useRef<HTMLDivElement>(null);
  const myClassRef  = useRef<HTMLDivElement>(null);

  const reducedMotion = useReducedMotion();
  const [cinemaPhase, setCinemaPhase] = useState<CinemaPhase>("lobby");
  const [signingTab, setSigningTab] = useState<SigningTab>("my-class");

  // Per-recruit reveal state (sealed phase)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [heroRecruit, setHeroRecruit] = useState<RevealRecruit | null>(null);
  const [battleRecruit, setBattleRecruit] = useState<RevealRecruit | null>(null);

  // Gem ceremony state
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

  const myTeamEntry = useMemo(
    () => (data?.myTeamId ? (data?.teamData?.find(t => t.team.id === data?.myTeamId) ?? null) : null),
    [data?.teamData, data?.myTeamId]
  );
  const teamColor = myTeamEntry?.team.primaryColor ?? "#C4A35A";

  const myTeamRecruits = useMemo(
    () => [...(myTeamEntry?.recruits ?? [])].sort((a, b) => b.overall - a.overall),
    [myTeamEntry]
  );
  const hasMyClass = myTeamRecruits.length > 0;

  useEffect(() => {
    if (data && !hasMyClass) setSigningTab("all-teams");
  }, [data, hasMyClass]);

  const revealedTeams = useRef<Set<string>>(new Set());

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
    return items.sort((a, b) => b.overall - a.overall);
  }, [data?.teamData]);

  const classRank = useMemo(
    () => (data?.myTeamId ? getClassRank(data.teamData, data.myTeamId) : 0),
    [data]
  );
  const totalTeamsWithCommits = useMemo(
    () => data?.teamData.filter(t => t.recruits.length > 0).length ?? 0,
    [data]
  );

  // Phase machine: go to lobby when data loads; skip to cards if reduced motion
  useEffect(() => {
    if (!data) return;
    if (reducedMotion) {
      setCinemaPhase("cards");
      return;
    }
    setCinemaPhase("lobby");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, reducedMotion]);

  // Fire reveal-complete when entering cards phase
  useEffect(() => {
    if (cinemaPhase !== "cards" || !data?.myTeamId || !leagueId) return;
    const teamId = data.myTeamId;
    if (revealedTeams.current.has(teamId)) return;
    revealedTeams.current.add(teamId);
    apiRequest("POST", `/api/leagues/${leagueId}/signing-day-reveal/complete?teamId=${teamId}`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
      })
      .catch((err) => console.error("[reveal-complete] failed:", err));
  }, [cinemaPhase, data?.myTeamId, leagueId]);

  // Gem ceremony setup
  const myTeamSortedRecruits = useMemo(
    () => [...(myTeamEntry?.recruits ?? [])].sort((a, b) => b.overall - a.overall),
    [myTeamEntry]
  );
  const gemRecruit = useMemo(
    () => (!reducedMotion ? (myTeamSortedRecruits.find(r => r.isGenerationalGem && r.gemBustRevealed) ?? null) : null),
    [myTeamSortedRecruits, reducedMotion]
  );

  useEffect(() => {
    setGemPhase("waiting");
    setGemColorOverride(null);
  }, [data?.myTeamId]);

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
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [cinemaPhase, gemRecruit]);

  // Lobby handlers
  const handleStartReveal = useCallback(() => setCinemaPhase("sealed"), []);
  const handleSkipToResults = useCallback(() => setCinemaPhase("cards"), []);

  // Per-card reveal
  const handleRevealCard = useCallback((recruit: RevealRecruit) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      next.add(recruit.id);
      return next;
    });
    const tier = getRevealTier(recruit);
    if (tier === "generational" || tier === "program-changer" || tier === "blue-chip") {
      setHeroRecruit(recruit);
    }
  }, []);

  const handleRevealAll = useCallback(() => {
    setRevealedIds(new Set(myTeamRecruits.map(r => r.id)));
  }, [myTeamRecruits]);

  const handleProceedToClass = useCallback(() => {
    setCinemaPhase("cards");
    setSigningTab("my-class");
  }, []);

  const allRevealed = myTeamRecruits.length > 0 && myTeamRecruits.every(r => revealedIds.has(r.id));

  // Download
  const handleDownload = async () => {
    const target = myClassRef.current;
    if (!target) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, {
        backgroundColor: "#0d1f0d",
        scale: 2,
        logging: false,
        useCORS: true,
        onclone: (_doc, clonedEl) => {
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
      link.download = `my-class-season-${data?.league.currentSeason ?? "unknown"}.png`;
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

  const showCards  = cinemaPhase === "cards";
  const showSealed = cinemaPhase === "sealed";
  const showLobby  = cinemaPhase === "lobby";

  // My Class summary stats
  const myAvgOvr    = myTeamRecruits.length > 0 ? Math.round(myTeamRecruits.reduce((s, r) => s + r.overall, 0) / myTeamRecruits.length) : 0;
  const myFiveStars = myTeamRecruits.filter(r => r.starRating >= 5).length;
  const myFourStars = myTeamRecruits.filter(r => r.starRating >= 4 && r.starRating < 5).length;
  const myBlueChips = myTeamRecruits.filter(r => r.isBlueChip).length;
  const myTransfers = myTeamRecruits.filter(r => r.recruitType === "TRANSFER").length;
  const myJucos     = myTeamRecruits.filter(r => r.recruitType === "JUCO").length;
  const myClassPts  = Math.round(getClassScore(myTeamRecruits));

  return (
    <div className="relative min-h-screen bg-background">

      {/* ── Cinematic effect layers (fixed, not captured by html2canvas) ── */}
      {!reducedMotion && (
        <>
          <FireworksCanvas
            key="league-reveal"
            teamColor={teamColor}
            active={showCards || showSealed}
            overrideColors={gemColorOverride}
          />
          <GemSpotlight active={gemPhase === "spotlight" || gemPhase === "burst"} />
          <GemBurst active={gemPhase === "burst"} />
        </>
      )}

      {/* Hero Spotlight overlay */}
      {heroRecruit && (
        <HeroSpotlight
          recruit={heroRecruit}
          primaryColor={myTeamEntry?.team.primaryColor ?? "#C4A35A"}
          onClose={() => setHeroRecruit(null)}
        />
      )}

      {/* Lobby phase — full-screen overlay */}
      {showLobby && data && (
        <RevealIntroLobby
          teamEntry={myTeamEntry}
          season={data.league.currentSeason}
          recruitCount={myTeamRecruits.length}
          reducedMotion={reducedMotion}
          onStart={hasMyClass ? handleStartReveal : handleSkipToResults}
          onSkip={handleSkipToResults}
        />
      )}

      {/* ── Main content (z-10, above background layers) ── */}
      <div className="relative z-10 p-4 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Link href={`/league/${leagueId}/commits`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back-to-commits">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Commits
            </RetroButton>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg font-bold text-[#C4A35A] leading-tight">SIGNING DAY REVEAL</h1>
            <p className="text-xs text-gray-400">
              Season {data?.league.currentSeason} · {allLeagueRecruits.length} total commits
              {showSealed ? ` · ${revealedIds.size}/${myTeamRecruits.length} opened` : showCards ? " · Click any card to flip" : ""}
            </p>
          </div>
          {showCards && signingTab === "my-class" && hasMyClass && (
            <RetroButton
              variant="primary"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
              data-testid="button-download-class-photo"
            >
              <Download className="w-4 h-4 mr-1" />
              {isDownloading ? "Saving..." : "Download Class Poster"}
            </RetroButton>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            SEALED PHASE — Letter of Intent grid
        ══════════════════════════════════════════════════════ */}
        {showSealed && (
          <div>
            {hasMyClass ? (
              <>
                {/* Controls bar */}
                <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-lg" style={{ background: "#0a180a", border: "1px solid #1a3a1a" }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#C4A35A]">
                      {myTeamEntry?.team.name ?? "Your Class"}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {revealedIds.size} of {myTeamRecruits.length} letters opened
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <RetroButton
                      variant="outline"
                      size="sm"
                      onClick={handleRevealAll}
                      data-testid="button-reveal-all"
                    >
                      Open All
                    </RetroButton>
                    {allRevealed && (
                      <RetroButton
                        variant="primary"
                        size="sm"
                        onClick={handleProceedToClass}
                        data-testid="button-view-class"
                      >
                        View Full Class <ArrowRight className="w-3 h-3 ml-1" />
                      </RetroButton>
                    )}
                    <RetroButton
                      variant="ghost"
                      size="sm"
                      onClick={handleSkipToResults}
                      data-testid="button-skip-sealed"
                    >
                      Skip to Results
                    </RetroButton>
                  </div>
                </div>

                {/* Sealed / revealed card grid */}
                <div className="flex flex-wrap gap-3" data-testid="sealed-card-grid">
                  {myTeamRecruits.map((r, idx) => {
                    const isRevealed = revealedIds.has(r.id);
                    const isThisGem  = !!(r.isGenerationalGem && r.gemBustRevealed);
                    return (
                      <div key={r.id} className="relative" style={{ flexShrink: 0 }}>
                        {isThisGem && isRevealed && (
                          <div
                            className="absolute pointer-events-none"
                            style={{ inset: -3, borderRadius: "11px", zIndex: 8, boxShadow: "0 0 18px 4px rgba(251,191,36,0.45), 0 0 38px 8px rgba(251,191,36,0.18)" }}
                            aria-hidden
                          />
                        )}
                        {isRevealed ? (
                          <RevealPortraitCard
                            recruit={r}
                            primaryColor={myTeamEntry?.team.primaryColor ?? "#C4A35A"}
                            animationDelay={0}
                            disableAnimation={reducedMotion}
                            cardWidth={160}
                            cardHeight={220}
                          />
                        ) : (
                          <SealedCard
                            recruit={r}
                            onReveal={() => handleRevealCard(r)}
                            animationDelay={idx * 0.055}
                            reducedMotion={reducedMotion}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Proceed CTA after all revealed */}
                {allRevealed && (
                  <div className="flex justify-center mt-8">
                    <RetroButton
                      variant="primary"
                      size="lg"
                      onClick={handleProceedToClass}
                      data-testid="button-view-full-class"
                    >
                      View Full Class Poster <ArrowRight className="w-4 h-4 ml-2" />
                    </RetroButton>
                  </div>
                )}
              </>
            ) : (
              /* No class — skip straight to results */
              <div className="text-center py-16">
                <p className="font-display text-sm font-bold text-gray-500">No commits this season</p>
                <p className="text-xs text-gray-600 mt-2">Switch to All Teams or All Recruits to see the full class</p>
                <RetroButton variant="primary" className="mt-6" onClick={handleSkipToResults}>
                  View League Results
                </RetroButton>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            CARDS PHASE — Full tabbed view
        ══════════════════════════════════════════════════════ */}
        {showCards && (
          <>
            {/* Tab switcher */}
            <div className="flex border-b border-[#1a3a1a] mb-6" data-testid="signing-tab-bar">
              {([
                { key: "my-class",     label: "My Class",     sub: `${myTeamRecruits.length} commit${myTeamRecruits.length !== 1 ? "s" : ""}` },
                { key: "all-teams",    label: "All Teams",    sub: `${totalTeamsWithCommits} team${totalTeamsWithCommits !== 1 ? "s" : ""}` },
                { key: "all-recruits", label: "All Recruits", sub: `${allLeagueRecruits.length} total` },
              ] as { key: SigningTab; label: string; sub: string }[]).map(({ key, label, sub }) => (
                <button
                  key={key}
                  onClick={() => setSigningTab(key)}
                  className="px-4 py-2.5 relative text-left"
                  data-testid={`tab-${key}`}
                >
                  <div className={`text-xs font-semibold leading-tight transition-colors ${signingTab === key ? "text-[#C4A35A]" : "text-gray-500 hover:text-gray-300"}`}>
                    {label}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{sub}</div>
                  {signingTab === key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C4A35A]" />
                  )}
                </button>
              ))}
            </div>

            {/* ── MY CLASS TAB ── */}
            {signingTab === "my-class" && (
              <div
                ref={myClassRef}
                className="rounded-lg p-4"
                style={{ background: "#0d1f0d" }}
                data-testid="my-class-view"
              >
                {/* Poster header */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#1a3a1a]">
                  {myTeamEntry && (
                    <TeamBadge
                      abbreviation={myTeamEntry.team.abbreviation}
                      primaryColor={myTeamEntry.team.primaryColor}
                      secondaryColor={myTeamEntry.team.secondaryColor}
                      size="lg"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-bold text-[#C4A35A] leading-tight truncate">
                      {myTeamEntry?.team.name ?? "No Team Assigned"}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Season {data?.league.currentSeason} Recruiting Class
                      {classRank > 0 && ` · National Rank #${classRank} of ${totalTeamsWithCommits}`}
                    </div>
                  </div>
                  <Trophy className="w-5 h-5 text-[#C4A35A] shrink-0" />
                </div>

                {/* Stat strip */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 mb-5 px-1 pb-4 border-b border-[#1a3a1a]">
                  {[
                    { label: "Commits",    value: myTeamRecruits.length },
                    { label: "Avg OVR",    value: myAvgOvr },
                    { label: "5★",         value: myFiveStars },
                    { label: "4★",         value: myFourStars },
                    { label: "Blue Chips", value: myBlueChips },
                    ...(myTransfers > 0 ? [{ label: "Transfers", value: myTransfers }] : []),
                    ...(myJucos > 0     ? [{ label: "JUCO",      value: myJucos     }] : []),
                    { label: "Class Pts",  value: myClassPts },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center min-w-[52px]">
                      <span className="font-display text-xl font-bold text-white">{value}</span>
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                  ))}
                </div>

                {/* 4-across wider card grid */}
                {hasMyClass ? (
                  <div
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 252px)", gap: "12px" }}
                    className="overflow-x-auto"
                    data-testid="my-class-grid"
                  >
                    {myTeamRecruits.map((r, idx) => {
                      const isThisGem = !!(r.isGenerationalGem && r.gemBustRevealed);
                      return (
                        <div
                          key={r.id}
                          className="relative"
                          style={{ animation: isThisGem ? "sdGemSlideIn 0.7s ease-out both" : undefined }}
                          data-testid={isThisGem ? "gem-card-wrapper" : `my-card-wrapper-${r.id}`}
                        >
                          {!reducedMotion && (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                inset: -4, borderRadius: "10px", zIndex: 10,
                                animation: isThisGem
                                  ? "sdShockwave 0.85s ease-out 0.25s both"
                                  : `sdSparkRing 0.5s ease-out ${idx * 0.05 + 0.45}s both`,
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
                            recruit={r}
                            primaryColor={myTeamEntry?.team.primaryColor ?? "#C4A35A"}
                            animationDelay={isThisGem ? 0 : idx * 0.05}
                            disableAnimation={reducedMotion && !isThisGem}
                            cardWidth={252}
                            cardHeight={348}
                            onBattleReport={r.recruitingResult ? () => setBattleRecruit(r) : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="font-display text-sm font-bold text-gray-500">No commits this season</p>
                    <p className="text-xs text-gray-600 mt-2">Switch to All Teams or All Recruits to see the full class</p>
                  </div>
                )}

                {/* Gem ceremony label */}
                {gemRecruit && gemPhase === "revealed" && (
                  <div className="flex justify-center mt-3" data-testid="gem-card-section">
                    <div
                      className="text-amber-400 text-xs tracking-widest"
                      style={{ animation: "sdGemLabelPulse 2.2s ease-in-out infinite" }}
                      data-testid="gem-label"
                    >
                      ✦ GENERATIONAL TALENT ✦
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ALL RECRUITS TAB ── */}
            {signingTab === "all-recruits" && (
              <div>
                {allLeagueRecruits.length > 0 ? (
                  <>
                    <div
                      ref={cardGridRef}
                      className="rounded-lg p-4"
                      style={{ background: "#0d1f0d" }}
                    >
                      {/* League header */}
                      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#1a3a1a]">
                        <Trophy className="w-6 h-6 text-[#C4A35A] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-display text-sm font-bold text-[#C4A35A]">{data?.league.name ?? "LEAGUE"} SIGNING CLASS</div>
                          <div className="text-xs text-gray-400">
                            Season {data?.league.currentSeason} · {allLeagueRecruits.length} commits across {data?.teamData?.filter(t => t.recruits.length > 0).length ?? 0} teams
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-semibold text-gray-500">SORTED HIGHEST → LOWEST OVR</div>
                        </div>
                      </div>

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

                      {gemRecruit && gemPhase === "revealed" && (
                        <div className="flex justify-center mt-3" data-testid="gem-card-section">
                          <div
                            className="text-amber-400 text-xs tracking-widest"
                            style={{ animation: "sdGemLabelPulse 2.2s ease-in-out infinite" }}
                            data-testid="gem-label"
                          >
                            ✦ GENERATIONAL TALENT ✦
                          </div>
                        </div>
                      )}
                    </div>

                    {/* League stats bar */}
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
                              <span className="font-display text-lg font-bold text-white">{value}</span>
                              <span className="text-xs text-gray-500">{label}</span>
                            </div>
                          ))}
                        </div>
                      </RetroCardContent>
                    </RetroCard>
                  </>
                ) : (
                  <div className="text-center text-gray-500 py-16">
                    <p className="font-display text-sm font-bold">No commits in this league</p>
                  </div>
                )}
              </div>
            )}

            {/* ── ALL TEAMS TAB ── */}
            {signingTab === "all-teams" && data && (
              <PostRevealSummary
                teamData={data.teamData}
                myTeamId={data.myTeamId}
                currentSeason={data.league.currentSeason}
              />
            )}
          </>
        )}

        {/* No data */}
        {!data && !isLoading && (
          <div className="text-center text-gray-500 py-16">
            <p className="font-display text-sm font-bold">No signing class data available</p>
            <p className="text-xs mt-2">Check back once recruiting has ended</p>
          </div>
        )}
      </div>

      {/* Battle Report modal */}
      {battleRecruit && (
        <BattleReportModal
          recruit={battleRecruit}
          onClose={() => setBattleRecruit(null)}
        />
      )}
    </div>
  );
}


// ── PostRevealSummary ──────────────────────────────────────────
function PostRevealSummary({
  teamData,
  myTeamId,
  currentSeason,
}: {
  teamData: TeamEntry[];
  myTeamId: string | null;
  currentSeason: number;
}) {
  const rankedTeams = useMemo(
    () =>
      [...teamData]
        .filter(t => t.recruits.length > 0)
        .sort((a, b) => getClassScore(b.recruits) - getClassScore(a.recruits)),
    [teamData]
  );

  if (rankedTeams.length === 0) return null;

  return (
    <div className="mt-10" data-testid="post-reveal-summary">
      <div className="flex items-center gap-2 mb-6 pb-2 border-b border-[#1a3a1a]">
        <Trophy className="w-4 h-4 text-[#C4A35A]" />
        <h2 className="text-[#C4A35A] text-xs tracking-widest">
          CLASS RANKINGS — SEASON {currentSeason}
        </h2>
      </div>

      <div className="flex flex-col gap-8">
        {rankedTeams.map((entry, idx) => {
          const rank = idx + 1;
          const isMyTeam = entry.team.id === myTeamId;
          const sortedRecruits = [...entry.recruits].sort((a, b) => b.overall - a.overall);
          const avgOvr = Math.round(entry.recruits.reduce((s, r) => s + r.overall, 0) / entry.recruits.length);
          const fiveStars = entry.recruits.filter(r => r.starRating >= 5).length;
          const fourStars = entry.recruits.filter(r => r.starRating >= 4 && r.starRating < 5).length;
          const blueChips = entry.recruits.filter(r => r.isBlueChip).length;

          return (
            <div
              key={entry.team.id}
              className="rounded-lg overflow-hidden border"
              style={{ borderColor: isMyTeam ? entry.team.primaryColor + "66" : "#1a3a1a" }}
              data-testid={`summary-team-${entry.team.abbreviation}`}
            >
              {/* Team header row */}
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ background: isMyTeam ? `${entry.team.primaryColor}1a` : "#0a180a" }}
              >
                <span
                  className="font-display text-xl font-bold shrink-0"
                  style={{
                    color: rank === 1 ? "#C4A35A" : rank <= 3 ? "#facc15" : "#6b7280",
                    minWidth: "36px",
                  }}
                >
                  #{rank}
                </span>
                <TeamBadge
                  abbreviation={entry.team.abbreviation}
                  primaryColor={entry.team.primaryColor}
                  secondaryColor={entry.team.secondaryColor}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-white">{entry.team.name}</span>
                    {isMyTeam && <span className="text-xs text-[#C4A35A]">(You)</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {entry.recruits.length} commits · Avg OVR {avgOvr}
                    {blueChips > 0 && ` · ${blueChips} Blue Chip${blueChips > 1 ? "s" : ""}`}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  {fiveStars > 0 && <span className="text-red-400 text-xs font-semibold">{fiveStars}×5★</span>}
                  {fourStars > 0 && <span className="text-yellow-400 text-xs font-semibold">{fourStars}×4★</span>}
                  <span className="text-xs font-semibold text-[#C4A35A]">{getClassScore(entry.recruits).toFixed(0)} pts</span>
                </div>
              </div>

              {/* Full recruit card grid */}
              <div
                className="p-3 overflow-x-auto"
                style={{ background: "#0d1f0d" }}
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
            </div>
          );
        })}
      </div>

    </div>
  );
}
