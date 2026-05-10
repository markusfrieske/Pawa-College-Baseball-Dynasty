import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type TrackId =
  | "game_start"
  | "standings"
  | "league_management"
  | "recruiting"
  | "graduation"
  | "final_score"
  | "playoffs"
  | "interview"
  | "offseason"
  | "predictions"
  | "none";

const TRACK_URLS: Record<Exclude<TrackId, "none">, string> = {
  game_start: "/music/Game_Start.mp3",
  standings: "/music/Standings.mp3",
  league_management: "/music/League_Management.mp3",
  recruiting: "/music/Recruiting.mp3",
  graduation: "/music/Graduation.mp3",
  final_score: "/music/Final_Score.mp3",
  playoffs: "/music/Playoffs.mp3",
  interview: "/music/Interview.mp3",
  offseason: "/music/Offseason.mp3",
  predictions: "/music/Predictions.mp3",
};

interface MusicContextValue {
  currentTrack: TrackId;
  setTrack: (track: TrackId) => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  toggleMute: () => void;
  isPlaying: boolean;
}

const MusicContext = createContext<MusicContextValue | null>(null);

const STORAGE_KEY_VOLUME = "cbd_music_volume";
const STORAGE_KEY_MUTED = "cbd_music_muted";
const FADE_DURATION = 800;

function getStoredVolume(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (v !== null) return Math.max(0, Math.min(1, parseFloat(v)));
  } catch {}
  return 0.5;
}

function getStoredMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MUTED) === "true";
  } catch {}
  return false;
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<TrackId>("none");
  const [volume, setVolumeState] = useState(getStoredVolume);
  const [muted, setMuted] = useState(getStoredMuted);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const pendingTrackRef = useRef<TrackId>("none");

  // Refs that mirror state — let setTrack stay stable across state changes
  const currentTrackRef = useRef<TrackId>("none");
  const volumeRef = useRef(getStoredVolume());
  const mutedRef = useRef(getStoredMuted());
  const hasInteractedRef = useRef(false);
  // Incremented on every setTrack call; lets an awaited fadeOut detect it's stale
  const trackGenRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = mutedRef.current ? 0 : volumeRef.current;
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);

      // Play any pending track now that the user has interacted
      if (pendingTrackRef.current !== "none" && audioRef.current) {
        const url = TRACK_URLS[pendingTrackRef.current as Exclude<TrackId, "none">];
        if (url && audioRef.current.paused) {
          audioRef.current.src = url;
          audioRef.current.volume = mutedRef.current ? 0 : volumeRef.current;
          audioRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  // rAF-based fade — wall-clock accurate, no setInterval throttling
  const fadeOut = useCallback((audio: HTMLAudioElement): Promise<void> => {
    return new Promise((resolve) => {
      if (audio.paused || audio.volume === 0) {
        audio.pause();
        resolve();
        return;
      }

      const startVol = audio.volume;
      const startTime = performance.now();

      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / FADE_DURATION);
        audio.volume = Math.max(0, startVol * (1 - progress));

        if (progress < 1) {
          fadeRafRef.current = requestAnimationFrame(tick);
        } else {
          fadeRafRef.current = null;
          audio.pause();
          audio.volume = startVol;
          resolve();
        }
      };

      fadeRafRef.current = requestAnimationFrame(tick);
    });
  }, []);

  const setTrack = useCallback(
    async (track: TrackId) => {
      if (track === currentTrackRef.current) return;

      // Bump generation so any in-flight setTrack can detect it became stale
      const gen = ++trackGenRef.current;

      currentTrackRef.current = track;
      pendingTrackRef.current = track;
      setCurrentTrack(track);

      const audio = audioRef.current;
      if (!audio) return;

      // Cancel any in-flight rAF fade before starting a new transition
      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }

      if (track === "none") {
        await fadeOut(audio);
        return;
      }

      const url = TRACK_URLS[track];
      if (!url) return;

      if (!audio.paused) {
        await fadeOut(audio);
        // If another setTrack call arrived while we were fading, bail out
        if (gen !== trackGenRef.current) return;
      }

      audio.src = url;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;

      if (hasInteractedRef.current) {
        audio.play().catch(() => {});
      }
    },
    [fadeOut]
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
    } catch {}
    if (audioRef.current && !mutedRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEY_MUTED, String(next));
      } catch {}
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volumeRef.current;
      }
      return next;
    });
  }, []);

  return (
    <MusicContext.Provider
      value={{ currentTrack, setTrack, volume, setVolume, muted, toggleMute, isPlaying }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}

export function useUpdateMusicPhase() {
  const { setTrack } = useMusic();
  return useCallback(
    (phase: string) => {
      const pathname = window.location.pathname;
      const track = resolveTrackForRoute(pathname, phase);
      setTrack(track);
    },
    [setTrack]
  );
}

export function resolveTrackForRoute(
  pathname: string,
  leaguePhase?: string
): TrackId {
  if (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/guest") {
    return "game_start";
  }

  if (pathname.includes("/play-by-play")) {
    return "interview";
  }

  if (pathname.includes("/recruiting") || pathname.includes("/recruit/")) {
    return "recruiting";
  }

  if (pathname.includes("/commissioner") || pathname.includes("/edit-rosters") || pathname.includes("/edit-recruits")) {
    return "graduation";
  }

  if (pathname.includes("/departures") || pathname.includes("/players-leaving") || pathname.includes("/transfer-portal")) {
    return "offseason";
  }

  if (pathname.includes("/commits")) {
    return "predictions";
  }

  if (leaguePhase) {
    switch (leaguePhase) {
      case "preseason":
      case "spring_training":
      case "regular_season":
        return "league_management";
      case "conference_championship":
      case "super_regionals":
        return "final_score";
      case "cws":
        return "playoffs";
      case "offseason":
        return "interview";
      case "offseason_departures":
        return "offseason";
      case "offseason_signing_day":
        return "predictions";
      case "offseason_walkons":
        return "offseason";
      default:
        if (leaguePhase.startsWith("offseason_recruiting")) {
          return "recruiting";
        }
        return "standings";
    }
  }

  return "standings";
}
