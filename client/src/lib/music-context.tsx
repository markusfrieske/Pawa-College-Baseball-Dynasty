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
// Crossfade duration in ms — long enough to be smooth, short enough to feel snappy.
const FADE_DURATION = 1000;
// Seconds before a looping track ends when we start the next loop crossfade.
const LOOP_LOOKAHEAD = 0.5;

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
    sessionStorage.setItem(STORAGE_KEY_PRELOADED, JSON.stringify(Array.from(ids)));
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

// Internal crossfade state tracked as a ref so it can be cancelled at any time.
type CrossfadeState = {
  rafId: number;
  startTime: number;
  outgoing: HTMLAudioElement | null;
  incoming: HTMLAudioElement;
  startOutVol: number;
  /** Current target volume for the incoming element (updated on volume/mute changes). */
  targetIn: number;
  onDone?: () => void;
};

export function MusicProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<TrackId>("none");
  const [volume, setVolumeState] = useState(getStoredVolume);
  const [muted, setMuted] = useState(getStoredMuted);
  const [isPlaying, setIsPlaying] = useState(false);

  // Two audio elements — we ping-pong between them for gapless crossfades.
  // slot 0 = element A, slot 1 = element B.
  const elemsRef = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  // Which slot is currently "active" (audible).
  const activeSlotRef = useRef<0 | 1>(0);

  // In-flight crossfade. A single rAF loop drives both fade-out and fade-in.
  const xfRef = useRef<CrossfadeState | null>(null);

  // Cleanup function for the loop-gap timeupdate listener.
  const loopCleanupRef = useRef<(() => void) | null>(null);

  const pendingTrackRef = useRef<TrackId>("none");
  const currentTrackRef = useRef<TrackId>("none");
  const volumeRef = useRef(getStoredVolume());
  const mutedRef = useRef(getStoredMuted());
  const hasInteractedRef = useRef(false);

  // Incremented on every setTrack call so stale continuations bail out.
  const trackGenRef = useRef(0);

  // Pre-buffer cache: retained Audio elements keyed by TrackId.
  const preloadMapRef = useRef<Map<TrackId, HTMLAudioElement>>(new Map());
  const preloadIdleIdsRef = useRef<number[]>([]);
  const sessionPreloadedRef = useRef<Set<TrackId>>(getSessionPreloaded());

  // Keep state refs in sync
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const schedulePreload = useCallback((tracks: TrackId[]) => {
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
        preloadMapRef.current.set(id, buf);
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

  // Cancel any in-flight crossfade, snapping both elements to their end-state
  // volumes so the audio stays at a consistent level (no sudden jumps).
  const cancelCrossfade = useCallback(() => {
    const xf = xfRef.current;
    if (!xf) return;
    cancelAnimationFrame(xf.rafId);
    if (xf.outgoing) {
      xf.outgoing.pause();
    }
    xf.incoming.volume = xf.targetIn;
    xfRef.current = null;
  }, []);

  // Start a dual-element crossfade. Both elements' volumes are driven by a
  // single rAF loop so they stay perfectly in sync.
  // - outgoing: element currently playing (null → incoming fades in from silence)
  // - incoming: element to fade in (must already be playing or about to play)
  // - targetVol: the volume incoming should reach at the end of the fade
  const startCrossfade = useCallback((
    outgoing: HTMLAudioElement | null,
    incoming: HTMLAudioElement,
    targetVol: number,
    onDone?: () => void,
  ) => {
    cancelCrossfade();

    const state: CrossfadeState = {
      rafId: 0,
      startTime: performance.now(),
      outgoing,
      incoming,
      startOutVol: outgoing ? outgoing.volume : 0,
      targetIn: targetVol,
      onDone,
    };
    xfRef.current = state;

    const tick = (now: number) => {
      if (xfRef.current !== state) return; // superseded by a newer crossfade
      const progress = Math.min(1, (now - state.startTime) / FADE_DURATION);

      if (state.outgoing && !state.outgoing.paused) {
        state.outgoing.volume = Math.max(0, state.startOutVol * (1 - progress));
      }
      state.incoming.volume = Math.min(state.targetIn, state.targetIn * progress);

      if (progress < 1) {
        state.rafId = requestAnimationFrame(tick);
      } else {
        xfRef.current = null;
        if (state.outgoing) {
          state.outgoing.pause();
          state.outgoing.src = "";
        }
        state.incoming.volume = state.targetIn;
        state.onDone?.();
      }
    };

    state.rafId = requestAnimationFrame(tick);
  }, [cancelCrossfade]);

  // Attach a timeupdate listener so that when the active element approaches
  // the end of its track we seamlessly loop via a crossfade rather than
  // relying on the browser's built-in gapless loop (which has an audible gap).
  const setupLoop = useCallback((audio: HTMLAudioElement, url: string) => {
    if (loopCleanupRef.current) {
      loopCleanupRef.current();
      loopCleanupRef.current = null;
    }

    const onTimeUpdate = () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const timeLeft = audio.duration - audio.currentTime;
      if (timeLeft > LOOP_LOOKAHEAD) return;
      // Remove listener immediately to prevent re-entry.
      audio.removeEventListener("timeupdate", onTimeUpdate);
      loopCleanupRef.current = null;

      // Skip if a track switch is already underway or music is off.
      if (xfRef.current !== null || currentTrackRef.current === "none") return;
      if (!elemsRef.current || !hasInteractedRef.current) return;

      const nextSlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0;
      const loopElem = elemsRef.current[nextSlot];
      loopElem.src = url;
      loopElem.currentTime = 0;
      loopElem.volume = 0;
      activeSlotRef.current = nextSlot;

      const targetVol = mutedRef.current ? 0 : volumeRef.current;
      loopElem.play().catch(() => {});
      startCrossfade(audio, loopElem, targetVol, () => {
        // Recurse: set up the next loop crossfade on the new active element.
        setupLoop(loopElem, url);
      });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    loopCleanupRef.current = () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [startCrossfade]);

  // Create both audio elements once on mount.
  useEffect(() => {
    const a = new Audio();
    const b = new Audio();
    a.preload = "auto";
    b.preload = "auto";
    elemsRef.current = [a, b];

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      // Only reflect not-playing if the active element stopped.
      if (elemsRef.current) {
        const active = elemsRef.current[activeSlotRef.current];
        if (active.paused) setIsPlaying(false);
      }
    };
    for (const el of [a, b]) {
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
    }

    // Pre-buffer the initial track and likely-next neighbours when the browser
    // is idle so the first play starts within 200ms on a warm cache.
    const initialTrack = resolveTrackForRoute(window.location.pathname);
    const initialPreload: TrackId[] = initialTrack !== "none"
      ? [initialTrack, ...LIKELY_NEXT[initialTrack]]
      : [...LIKELY_NEXT["none"]];
    schedulePreload(initialPreload);

    return () => {
      cancelCrossfade();
      if (loopCleanupRef.current) loopCleanupRef.current();
      for (const handle of preloadIdleIdsRef.current) {
        if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(handle);
        else clearTimeout(handle);
      }
      preloadIdleIdsRef.current = [];
      for (const el of [a, b]) {
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.pause();
        el.src = "";
      }
    };
  }, [schedulePreload, cancelCrossfade]);

  // Unlock autoplay on first user interaction and play any pending track.
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);

      const track = pendingTrackRef.current;
      if (track === "none" || !elemsRef.current) return;
      const active = elemsRef.current[activeSlotRef.current];
      if (!active.paused) return; // already playing via a previous interaction
      const url = TRACK_URLS[track as Exclude<TrackId, "none">];
      if (!url) return;
      // The src/volume should already be set from setTrack; just hit play.
      if (!active.src || active.src.endsWith("/") || active.src === "") {
        active.src = url;
      }
      active.volume = mutedRef.current ? 0 : volumeRef.current;
      active.play().catch(() => {});
    };
    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  const setTrack = useCallback((track: TrackId) => {
    if (track === currentTrackRef.current) return;

    const gen = ++trackGenRef.current;
    currentTrackRef.current = track;
    pendingTrackRef.current = track;
    setCurrentTrack(track);

    if (!elemsRef.current) return;

    // Always tear down the previous loop listener before switching.
    if (loopCleanupRef.current) {
      loopCleanupRef.current();
      loopCleanupRef.current = null;
    }

    if (track === "none") {
      // Fade out the active element and stop.
      const active = elemsRef.current[activeSlotRef.current];
      if (!active.paused) {
        const startVol = active.volume;
        const startTime = performance.now();
        cancelCrossfade();
        const state: CrossfadeState = {
          rafId: 0,
          startTime,
          outgoing: null,
          incoming: active, // we reuse "incoming" field to drive the fade-out
          startOutVol: startVol,
          targetIn: 0,
        };
        xfRef.current = state;
        const tick = (now: number) => {
          if (xfRef.current !== state || gen !== trackGenRef.current) return;
          const progress = Math.min(1, (now - startTime) / FADE_DURATION);
          active.volume = Math.max(0, startVol * (1 - progress));
          if (progress < 1) {
            state.rafId = requestAnimationFrame(tick);
          } else {
            active.pause();
            active.volume = startVol; // restore for next play
            xfRef.current = null;
          }
        };
        state.rafId = requestAnimationFrame(tick);
      }
      return;
    }

    const url = TRACK_URLS[track];
    if (!url) return;

    // Determine which element is outgoing and which will be the new active.
    const outgoingSlot = activeSlotRef.current;
    const incomingSlot: 0 | 1 = outgoingSlot === 0 ? 1 : 0;
    activeSlotRef.current = incomingSlot;

    const outgoing = elemsRef.current[outgoingSlot];
    const incoming = elemsRef.current[incomingSlot];

    // Prepare incoming element.
    // Setting src before play() allows the browser to begin buffering immediately
    // with preload="auto", ensuring play starts within ~200ms on a warm cache.
    incoming.src = url;
    incoming.currentTime = 0;
    incoming.volume = 0;

    const targetVol = mutedRef.current ? 0 : volumeRef.current;

    if (hasInteractedRef.current) {
      // Start the incoming element playing from silence, then crossfade.
      incoming.play().catch(() => {});
      startCrossfade(
        outgoing.paused ? null : outgoing,
        incoming,
        targetVol,
        () => {
          if (gen === trackGenRef.current) {
            setupLoop(incoming, url);
          }
        },
      );
    }

    schedulePreload(LIKELY_NEXT[track]);
  }, [cancelCrossfade, startCrossfade, setupLoop, schedulePreload]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    try { localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped)); } catch {}
    if (!mutedRef.current && elemsRef.current) {
      // Apply to all elements that are currently playing.
      for (const el of elemsRef.current) {
        if (!el.paused) el.volume = clamped;
      }
      // Also update the crossfade target so the in-progress fade ramps to
      // the new volume rather than the old one.
      if (xfRef.current) xfRef.current.targetIn = clamped;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      try { localStorage.setItem(STORAGE_KEY_MUTED, String(next)); } catch {}
      const targetVol = next ? 0 : volumeRef.current;
      if (elemsRef.current) {
        for (const el of elemsRef.current) {
          if (!el.paused) el.volume = targetVol;
        }
      }
      if (xfRef.current) xfRef.current.targetIn = targetVol;
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
