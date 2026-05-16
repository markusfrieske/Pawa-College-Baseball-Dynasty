import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getMoodForPhase, type MoodConfig } from "@/lib/atmosphere";
import { X, Trophy } from "lucide-react";

interface AtmosphereContextValue {
  phase: string;
  mood: MoodConfig;
}

const AtmosphereContext = createContext<AtmosphereContextValue>({
  phase: "neutral",
  mood: getMoodForPhase("neutral"),
});

const AtmosphereSetContext = createContext<(phase: string) => void>(() => {});
const AtmosphereSetBurstColorContext = createContext<(color: string) => void>(() => {});

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState("neutral");
  const [burstColor, setBurstColor] = useState("#C4A35A");
  const mood = getMoodForPhase(phase);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-mood", mood.mood);
    el.setAttribute("data-particles", mood.particleType);
    el.style.setProperty("--atm-overlay-h", String(mood.overlayH));
    el.style.setProperty("--atm-overlay-s", `${mood.overlayS}%`);
    el.style.setProperty("--atm-overlay-opacity", String(mood.overlayOpacity));
    el.style.setProperty("--atm-particle-opacity", String(mood.particleOpacity));
    if (mood.shimmer) {
      el.setAttribute("data-shimmer", "true");
    } else {
      el.removeAttribute("data-shimmer");
    }
  }, [mood]);

  useEffect(() => {
    document.documentElement.style.setProperty("--atm-burst-color", burstColor);
  }, [burstColor]);

  return (
    <AtmosphereSetBurstColorContext.Provider value={setBurstColor}>
      <AtmosphereSetContext.Provider value={setPhase}>
        <AtmosphereContext.Provider value={{ phase, mood }}>
          {children}
        </AtmosphereContext.Provider>
      </AtmosphereSetContext.Provider>
    </AtmosphereSetBurstColorContext.Provider>
  );
}

export function useUpdateAtmospherePhase() {
  return useContext(AtmosphereSetContext);
}

export function useSetAtmosphereBurstColor() {
  return useContext(AtmosphereSetBurstColorContext);
}

export function useAtmosphere() {
  return useContext(AtmosphereContext);
}

export function AtmosphereOverlay() {
  return <div className="atm-overlay" aria-hidden data-testid="atmosphere-overlay" />;
}

/** Matches real league IDs — excludes /league/create and similar static segments. */
const LEAGUE_ROUTE_RE = /^\/league\/(?!create(?:\/|$))[^/]+/;
const BANNER_DISMISS_KEY = "atm-postseason-banner-dismissed";

export function PostseasonBanner() {
  const { mood, phase } = useAtmosphere();
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const isLeagueContext = LEAGUE_ROUTE_RE.test(location);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(`${BANNER_DISMISS_KEY}-${phase}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [phase]);

  if (!mood.isPostseason || dismissed || !isLeagueContext) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(`${BANNER_DISMISS_KEY}-${phase}`, "1");
    } catch {}
  };

  return (
    <div
      className="atm-postseason-banner"
      data-testid="banner-postseason"
      role="banner"
    >
      <Trophy className="w-3 h-3 shrink-0" />
      <span className="font-pixel text-[9px] uppercase tracking-widest">
        {mood.postseasonLabel}
      </span>
      <button
        onClick={handleDismiss}
        className="ml-auto hover:opacity-70 transition-opacity shrink-0"
        aria-label="Dismiss postseason banner"
        data-testid="button-dismiss-postseason-banner"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function SigningDayBurst() {
  const { phase } = useAtmosphere();
  const [visible, setVisible] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (prev === null) {
      return;
    }

    if (phase === "offseason_signing_day" && prev !== "offseason_signing_day") {
      if (prefersReducedMotion()) return;
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  if (!visible) return null;

  return (
    <div
      className="atm-signing-burst"
      aria-hidden
      data-testid="signing-day-burst"
    />
  );
}
