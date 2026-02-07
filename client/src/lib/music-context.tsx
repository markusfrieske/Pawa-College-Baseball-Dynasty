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
  const [hasInteracted, setHasInteracted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const pendingTrackRef = useRef<TrackId>("none");

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = muted ? 0 : volume;
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
      setHasInteracted(true);
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (hasInteracted && pendingTrackRef.current !== "none" && audioRef.current) {
      const url = TRACK_URLS[pendingTrackRef.current as Exclude<TrackId, "none">];
      if (url && audioRef.current.paused) {
        audioRef.current.src = url;
        audioRef.current.volume = muted ? 0 : volume;
        audioRef.current.play().catch(() => {});
      }
    }
  }, [hasInteracted]);

  const fadeOut = useCallback((audio: HTMLAudioElement): Promise<void> => {
    return new Promise((resolve) => {
      if (audio.paused || audio.volume === 0) {
        audio.pause();
        resolve();
        return;
      }
      const startVol = audio.volume;
      const steps = 20;
      const stepTime = FADE_DURATION / steps;
      let step = 0;
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = window.setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
          audio.pause();
          audio.volume = startVol;
          resolve();
        }
      }, stepTime);
    });
  }, []);

  const setTrack = useCallback(
    async (track: TrackId) => {
      if (track === currentTrack) return;
      pendingTrackRef.current = track;
      setCurrentTrack(track);

      const audio = audioRef.current;
      if (!audio) return;

      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      if (track === "none") {
        await fadeOut(audio);
        return;
      }

      const url = TRACK_URLS[track];
      if (!url) return;

      if (!audio.paused) {
        await fadeOut(audio);
      }

      audio.src = url;
      audio.volume = muted ? 0 : volume;

      if (hasInteracted) {
        audio.play().catch(() => {});
      }
    },
    [currentTrack, volume, muted, hasInteracted, fadeOut]
  );

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setVolumeState(clamped);
      try {
        localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
      } catch {}
      if (audioRef.current && !muted) {
        audioRef.current.volume = clamped;
      }
    },
    [muted]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_MUTED, String(next));
      } catch {}
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

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
      default:
        if (leaguePhase.startsWith("offseason_recruiting")) {
          return "recruiting";
        }
        return "standings";
    }
  }

  return "standings";
}
