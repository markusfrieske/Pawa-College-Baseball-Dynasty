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

// Which tracks are likely to play next for each track, in priority order.
// Used to pre-buffer audio so the first play is instant.
const LIKELY_NEXT: Record<TrackId, TrackId[]> = {
  game_start:       ["standings", "league_management"],
  standings:        ["league_management", "recruiting"],
  league_management:["recruiting", "final_score", "standings"],
  recruiting:       ["league_management", "predictions"],
  graduation:       ["offseason", "interview"],
  final_score:      ["playoffs", "league_management"],
  playoffs:         ["interview", "standings"],
  interview:        ["offseason", "standings"],
  offseason:        ["predictions", "recruiting"],
  predictions:      ["league_management", "game_start"],
  none:             ["game_start"],
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
const STORAGE_KEY_PRELOADED = "cbd_music_preloaded";
const FADE_DURATION = 800;

function getSessionPreloaded(): Set<TrackId> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PRELOADED);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      return new Set(ids as TrackId[]);
    }
  } catch {}
  return new Set();
}

function writeSessionPreloaded(ids: Set<TrackId>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_PRELOADED, JSON.stringify([...ids]));
  } catch {}
}

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
  const pendingTrackRef = useRef<TrackId>("none");

  // Explicit cancel function for the in-flight fade — calling it resolves
  // the fade promise immediately so no dangling async state is left behind.
  const fadeCancelRef = useRef<(() => void) | null>(null);

  // Refs that mirror state so setTrack has a stable identity
  const currentTrackRef = useRef<TrackId>("none");
  const volumeRef = useRef(getStoredVolume());
  const mutedRef = useRef(getStoredMuted());
  const hasInteractedRef = useRef(false);

  // Incremented on every setTrack call; stale callers bail after each await
  const trackGenRef = useRef(0);

  // Pre-buffer cache: retained Audio elements keyed by TrackId.
  // Holding a strong reference prevents GC from discarding them before the
  // browser finishes buffering. When the main audio element later sets the
  // same src, the browser serves it from its HTTP cache with no gap.
  const preloadMapRef = useRef<Map<TrackId, HTMLAudioElement>>(new Map());
  // All pending idle callback handles — tracked so every one can be cancelled
  // cleanly on provider unmount even when multiple are queued concurrently.
  const preloadIdleIdsRef = useRef<number[]>([]);
  // Session-persistent set of track IDs that have been preloaded at least once
  // in this browser session. Survives page reloads so we don't create redundant
  // Audio elements when the browser HTTP cache already holds the file.
  const sessionPreloadedRef = useRef<Set<TrackId>>(getSessionPreloaded());

  const schedulePreload = useCallback((tracks: TrackId[]) => {
    // Skip tracks already buffered in-memory OR flagged in sessionStorage
    const needed = tracks.filter(
      id => id !== "none" &&
        !preloadMapRef.current.has(id) &&
        !sessionPreloadedRef.current.has(id)
    );
    if (needed.length === 0) return;

    const run = () => {
      for (const id of needed) {
        if (preloadMapRef.current.has(id) || sessionPreloadedRef.current.has(id)) continue;
        const url = TRACK_URLS[id as Exclude<TrackId, "none">];
        if (!url) continue;
        const buf = new Audio();
        buf.preload = "auto";
        buf.src = url;
        preloadMapRef.current.set(id, buf); // retain reference
        sessionPreloadedRef.current.add(id);
      }
      writeSessionPreloaded(sessionPreloadedRef.current);
    };

    if (typeof requestIdleCallback !== "undefined") {
      const handle = requestIdleCallback(run, { timeout: 4000 }) as unknown as number;
      preloadIdleIdsRef.current.push(handle);
    } else {
      const handle = window.setTimeout(run, 2000);
      preloadIdleIdsRef.current.push(handle);
    }
  }, []);

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

    // Pre-buffer the initial track (resolved from the current URL) and its
    // likely-next neighbours when the browser is idle. This ensures the very
    // first play is instant even on slow connections, not just subsequent ones.
    const initialTrack = resolveTrackForRoute(window.location.pathname);
    const initialPreload: TrackId[] = initialTrack !== "none"
      ? [initialTrack, ...LIKELY_NEXT[initialTrack]]
      : [...LIKELY_NEXT["none"]];
    schedulePreload(initialPreload);

    return () => {
      // Cancel any in-flight fade cleanly on unmount
      if (fadeCancelRef.current) {
        fadeCancelRef.current();
        fadeCancelRef.current = null;
      }
      for (const handle of preloadIdleIdsRef.current) {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(handle);
        } else {
          clearTimeout(handle);
        }
      }
      preloadIdleIdsRef.current = [];
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, [schedulePreload]);

  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);

      // Play any pending track now that autoplay is unlocked
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

  // rAF-based fade — wall-clock accurate, no setInterval throttling.
  // Canceling an in-flight fade resolves its promise immediately so callers
  // (setTrack) never hang waiting for a superseded fade to finish.
  const fadeOut = useCallback((audio: HTMLAudioElement): Promise<void> => {
    // Cancel and cleanly resolve any previous in-flight fade
    if (fadeCancelRef.current) {
      fadeCancelRef.current();
      fadeCancelRef.current = null;
    }

    return new Promise((resolve) => {
      if (audio.paused || audio.volume === 0) {
        audio.pause();
        resolve();
        return;
      }

      const startVol = audio.volume;
      const startTime = performance.now();
      let rafId: number;
      let canceled = false;

      fadeCancelRef.current = () => {
        canceled = true;
        cancelAnimationFrame(rafId);
        resolve(); // Resolve cleanly — no dangling promise
      };

      const tick = (now: number) => {
        if (canceled) return;

        const progress = Math.min(1, (now - startTime) / FADE_DURATION);
        audio.volume = Math.max(0, startVol * (1 - progress));

        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          fadeCancelRef.current = null;
          audio.pause();
          audio.volume = startVol;
          resolve();
        }
      };

      rafId = requestAnimationFrame(tick);
    });
  }, []);

  const setTrack = useCallback(
    async (track: TrackId) => {
      if (track === currentTrackRef.current) return;

      // Bump generation — stale callers bail after each await
      const gen = ++trackGenRef.current;

      currentTrackRef.current = track;
      pendingTrackRef.current = track;
      setCurrentTrack(track);

      const audio = audioRef.current;
      if (!audio) return;

      if (track === "none") {
        await fadeOut(audio);
        return;
      }

      const url = TRACK_URLS[track];
      if (!url) return;

      if (!audio.paused) {
        // fadeOut cancels any previous in-flight fade and starts a fresh one.
        // The previous setTrack that was awaiting the old fade gets resolved
        // immediately and bails via the generation check below.
        await fadeOut(audio);
        if (gen !== trackGenRef.current) return; // Stale — newer call took over
      }

      audio.src = url;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;

      if (hasInteractedRef.current) {
        audio.play().catch(() => {});
      }

      // Schedule preload of likely-next tracks while the browser is idle
      schedulePreload(LIKELY_NEXT[track]);
    },
    [fadeOut, schedulePreload]
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
