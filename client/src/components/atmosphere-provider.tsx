import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState("neutral");
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

  return (
    <AtmosphereSetContext.Provider value={setPhase}>
      <AtmosphereContext.Provider value={{ phase, mood }}>
        {children}
      </AtmosphereContext.Provider>
    </AtmosphereSetContext.Provider>
  );
}

export function useUpdateAtmospherePhase() {
  return useContext(AtmosphereSetContext);
}

export function useAtmosphere() {
  return useContext(AtmosphereContext);
}

export function AtmosphereOverlay() {
  return <div className="atm-overlay" aria-hidden data-testid="atmosphere-overlay" />;
}

const BANNER_DISMISS_KEY = "atm-postseason-banner-dismissed";

export function PostseasonBanner() {
  const { mood, phase } = useAtmosphere();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(`${BANNER_DISMISS_KEY}-${phase}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [phase]);

  if (!mood.isPostseason || dismissed) return null;

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

export function SigningDayBurst() {
  const { phase } = useAtmosphere();
  const [visible, setVisible] = useState(false);
  const prevPhaseRef = useRef<string>("neutral");
  const firedRef = useRef(false);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase === "offseason_signing_day" && prev !== "offseason_signing_day" && !firedRef.current) {
      firedRef.current = true;
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
