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
  | "drama"
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
  drama: "/music/Drama.mp3",
};

const LIKELY_NEXT: Record<TrackId, TrackId[]> = {
  game_start:        ["standings", "league_management"],
  standings:         ["league_management", "recruiting"],
  league_management: ["recruiting", "final_score", "standings", "drama"],
  recruiting:        ["league_management", "predictions"],
  graduation:        ["offseason", "interview"],
  final_score:       ["playoffs", "league_management"],
  playoffs:          ["interview", "standings"],
  interview:         ["offseason", "standings"],
  offseason:         ["predictions", "recruiting"],
  predictions:       ["league_management", "game_start"],
  drama:             ["league_management", "standings"],
  none:              ["game_start"],
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
const STORAGE_KEY_MUTED  = "cbd_music_muted";
const STORAGE_KEY_PRELOADED = "cbd_music_preloaded";
// Crossfade duration in ms — long enough to be smooth, short enough to feel snappy.
const FADE_DURATION = 1000;
// Seconds before a looping track ends when we fire the next loop crossfade.
const LOOP_LOOKAHEAD = 0.5;
// How long to wait for `canplaythrough` before we play anyway.
// Kept at 200 ms to match the spec's "first play within 200 ms" acceptance criterion.
const READINESS_TIMEOUT_MS = 200;

function getSessionPreloaded(): Set<TrackId> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PRELOADED);
    if (raw) return new Set(JSON.parse(raw) as TrackId[]);
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
  try { return localStorage.getItem(STORAGE_KEY_MUTED) === "true"; } catch {}
  return false;
}

// Returns a promise that resolves as soon as the audio element fires
// `canplaythrough`, or after READINESS_TIMEOUT_MS — whichever comes first.
function waitForReady(audio: HTMLAudioElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    audio.addEventListener("canplaythrough", done, { once: true });
    setTimeout(done, READINESS_TIMEOUT_MS);
  });
}

type CrossfadeState = {
  rafId: number;
  startTime: number;
  outgoing: HTMLAudioElement | null;
  incoming: HTMLAudioElement;
  startOutVol: number;
  /** Current target volume for incoming — updated by volume/mute changes. */
  targetIn: number;
  onDone?: () => void;
};

export function MusicProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<TrackId>("none");
  const [volume, setVolumeState] = useState(getStoredVolume);
  const [muted, setMuted] = useState(getStoredMuted);
  const [isPlaying, setIsPlaying] = useState(false);

  // Two audio elements — ping-pong between them for gapless crossfades.
  // slot 0 = element A, slot 1 = element B. Neither has `loop = true`;
  // looping is handled via setupLoop (timeupdate crossfade) to eliminate
  // the audible gap that browser-native looping produces.
  const elemsRef = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  const activeSlotRef = useRef<0 | 1>(0);

  // In-flight crossfade state. A single rAF loop drives both elements.
  const xfRef = useRef<CrossfadeState | null>(null);

  // Cleanup fn for the loop-end timeupdate listener.
  const loopCleanupRef = useRef<(() => void) | null>(null);

  const pendingTrackRef  = useRef<TrackId>("none");
  const currentTrackRef  = useRef<TrackId>("none");
  const volumeRef        = useRef(getStoredVolume());
  const mutedRef         = useRef(getStoredMuted());
  const hasInteractedRef = useRef(false);
  // Incremented on every setTrack call so stale async continuations bail out.
  const trackGenRef      = useRef(0);

  const preloadMapRef       = useRef<Map<TrackId, HTMLAudioElement>>(new Map());
  const preloadIdleIdsRef   = useRef<number[]>([]);
  const sessionPreloadedRef = useRef<Set<TrackId>>(getSessionPreloaded());

  // Keep state refs in sync with React state
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const schedulePreload = useCallback((tracks: TrackId[]) => {
    const needed = tracks.filter(
      id => id !== "none"
        && !preloadMapRef.current.has(id)
        && !sessionPreloadedRef.current.has(id)
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
      const h = requestIdleCallback(run, { timeout: 4000 }) as unknown as number;
      preloadIdleIdsRef.current.push(h);
    } else {
      const h = window.setTimeout(run, 2000);
      preloadIdleIdsRef.current.push(h);
    }
  }, []);

  // Cancel any in-flight crossfade, snapping both elements to their end-state
  // volumes instantly (avoids sudden jumps when a fade is cut short).
  const cancelCrossfade = useCallback(() => {
    const xf = xfRef.current;
    if (!xf) return;
    cancelAnimationFrame(xf.rafId);
    if (xf.outgoing) xf.outgoing.pause();
    xf.incoming.volume = Math.max(0, Math.min(1, xf.targetIn));
    xfRef.current = null;
  }, []);

  // Start a dual-element rAF crossfade.
  // outgoing fades from its current volume to 0; incoming fades from 0 to targetVol.
  // Pass outgoing = null to do a plain fade-in with no simultaneous fade-out.
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
      if (xfRef.current !== state) return; // superseded
      const progress = Math.max(0, Math.min(1, (now - state.startTime) / FADE_DURATION));

      if (state.outgoing && !state.outgoing.paused) {
        state.outgoing.volume = Math.max(0, Math.min(1, state.startOutVol * (1 - progress)));
      }
      state.incoming.volume = Math.max(0, Math.min(state.targetIn, state.targetIn * progress));

      if (progress < 1) {
        state.rafId = requestAnimationFrame(tick);
      } else {
        xfRef.current = null;
        if (state.outgoing) {
          state.outgoing.pause();
          state.outgoing.src = "";
        }
        state.incoming.volume = Math.max(0, Math.min(1, state.targetIn));
        state.onDone?.();
      }
    };

    state.rafId = requestAnimationFrame(tick);
  }, [cancelCrossfade]);

  // Attach a timeupdate listener so that when the active element approaches
  // its end we crossfade seamlessly into a fresh playback on the other element,
  // avoiding the audible gap that the browser's native loop produces.
  const setupLoop = useCallback((audio: HTMLAudioElement, url: string) => {
    // Remove any previous loop listener first.
    if (loopCleanupRef.current) {
      loopCleanupRef.current();
      loopCleanupRef.current = null;
    }

    const onTimeUpdate = () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      if (audio.duration - audio.currentTime > LOOP_LOOKAHEAD) return;

      // Remove immediately to prevent re-entry.
      audio.removeEventListener("timeupdate", onTimeUpdate);
      loopCleanupRef.current = null;

      // Skip if a track-switch crossfade is already in flight or music is off.
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
        setupLoop(loopElem, url); // recurse for the next loop iteration
      });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    loopCleanupRef.current = () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [startCrossfade]);

  // Initialize both audio elements once on mount.
  useEffect(() => {
    const a = new Audio();
    const b = new Audio();
    a.preload = "auto";
    b.preload = "auto";
    // NOTE: loop is intentionally NOT set — looping is handled by setupLoop.
    elemsRef.current = [a, b];

    const onPlay  = () => setIsPlaying(true);
    const onPause = () => {
      if (elemsRef.current) {
        const active = elemsRef.current[activeSlotRef.current];
        if (active.paused) setIsPlaying(false);
      }
    };
    for (const el of [a, b]) {
      el.addEventListener("play",  onPlay);
      el.addEventListener("pause", onPause);
    }

    // Pre-buffer the initial track and its likely-next neighbours when idle.
    const initialTrack = resolveTrackForRoute(window.location.pathname);
    const initialPreload: TrackId[] = initialTrack !== "none"
      ? [initialTrack, ...LIKELY_NEXT[initialTrack]]
      : [...LIKELY_NEXT["none"]];
    schedulePreload(initialPreload);

    return () => {
      cancelCrossfade();
      if (loopCleanupRef.current) loopCleanupRef.current();
      for (const h of preloadIdleIdsRef.current) {
        if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(h);
        else clearTimeout(h);
      }
      preloadIdleIdsRef.current = [];
      for (const el of [a, b]) {
        el.removeEventListener("play",  onPlay);
        el.removeEventListener("pause", onPause);
        el.pause();
        el.src = "";
      }
    };
  }, [schedulePreload, cancelCrossfade]);

  // Shared helper used both by handleInteraction (first play unlock) and
  // setTrack (subsequent track switches).  Waits for readiness, plays, and
  // attaches the loop listener so the track loops gaplessly.
  const playAndSetupLoop = useCallback((
    active: HTMLAudioElement,
    url: string,
    outgoing: HTMLAudioElement | null,
    targetVol: number,
    gen: number,
  ) => {
    let played = false;
    const doPlay = () => {
      if (played) return;
      played = true;
      if (gen !== trackGenRef.current) return; // stale — another setTrack won the race
      active.volume = 0;
      active.play().catch(() => {});
      startCrossfade(outgoing, active, targetVol, () => {
        if (gen === trackGenRef.current) setupLoop(active, url);
      });
    };
    // Fire as soon as the browser has enough data, or after 300 ms.
    active.addEventListener("canplaythrough", doPlay, { once: true });
    setTimeout(doPlay, READINESS_TIMEOUT_MS);
  }, [startCrossfade, setupLoop]);

  // Unlock autoplay on first user interaction and play any pending track.
  // This also attaches setupLoop so the first track loops gaplessly.
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractedRef.current = true;
      document.removeEventListener("click",   handleInteraction);
      document.removeEventListener("keydown", handleInteraction);

      const track = pendingTrackRef.current;
      if (track === "none" || !elemsRef.current) return;

      const active = elemsRef.current[activeSlotRef.current];
      if (!active.paused) return; // already playing from a prior interaction

      const url = TRACK_URLS[track as Exclude<TrackId, "none">];
      if (!url) return;

      // Ensure src is set (setTrack should have set it; guard for edge cases).
      if (!active.src || active.src === window.location.origin + "/") {
        active.src = url;
      }

      // setTrack already swapped the activeSlot and pointed the element at
      // the correct src; no outgoing element to fade out on first play.
      const targetVol = mutedRef.current ? 0 : volumeRef.current;
      const gen = trackGenRef.current;
      playAndSetupLoop(active, url, null, targetVol, gen);
    };

    document.addEventListener("click",   handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    return () => {
      document.removeEventListener("click",   handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [playAndSetupLoop]);

  const setTrack = useCallback(async (track: TrackId) => {
    if (track === currentTrackRef.current) return;

    const gen = ++trackGenRef.current;
    currentTrackRef.current = track;
    pendingTrackRef.current = track;
    setCurrentTrack(track);

    if (!elemsRef.current) return;

    // Always tear down the previous loop listener before doing anything else.
    if (loopCleanupRef.current) {
      loopCleanupRef.current();
      loopCleanupRef.current = null;
    }

    if (track === "none") {
      // Simple fade-out of the active element.
      const active = elemsRef.current[activeSlotRef.current];
      if (!active.paused) {
        const startVol  = active.volume;
        const startTime = performance.now();
        cancelCrossfade();
        const state: CrossfadeState = {
          rafId: 0, startTime,
          outgoing: null, incoming: active,
          startOutVol: startVol, targetIn: 0,
        };
        xfRef.current = state;
        const tick = (now: number) => {
          if (xfRef.current !== state || gen !== trackGenRef.current) return;
          const p = Math.max(0, Math.min(1, (now - startTime) / FADE_DURATION));
          active.volume = Math.max(0, Math.min(1, startVol * (1 - p)));
          if (p < 1) {
            state.rafId = requestAnimationFrame(tick);
          } else {
            active.pause();
            active.volume = Math.max(0, Math.min(1, startVol));
            xfRef.current = null;
          }
        };
        state.rafId = requestAnimationFrame(tick);
      }
      return;
    }

    const url = TRACK_URLS[track];
    if (!url) return;

    // Identify outgoing (current active) and swap to the incoming slot.
    const outgoingSlot  = activeSlotRef.current;
    const incomingSlot: 0 | 1 = outgoingSlot === 0 ? 1 : 0;
    activeSlotRef.current = incomingSlot;

    const outgoing = elemsRef.current[outgoingSlot];
    const incoming = elemsRef.current[incomingSlot];

    // Point the incoming element at the new track and start buffering.
    // preload="auto" means the browser will start filling its buffer immediately.
    incoming.src = url;
    incoming.currentTime = 0;
    incoming.volume = 0;

    if (!hasInteractedRef.current) {
      // Autoplay locked — handleInteraction will call playAndSetupLoop when
      // the user first interacts. Nothing else to do here.
      schedulePreload(LIKELY_NEXT[track]);
      return;
    }

    // Wait for enough data or the readiness timeout, whichever fires first,
    // to guarantee < 300 ms startup silence on a warm cache.
    await waitForReady(incoming);
    if (gen !== trackGenRef.current) {
      // A newer setTrack superseded us while we were awaiting — clean up.
      incoming.src = "";
      return;
    }

    const targetVol = mutedRef.current ? 0 : volumeRef.current;
    incoming.play().catch(() => {});
    startCrossfade(
      outgoing.paused ? null : outgoing,
      incoming,
      targetVol,
      () => { if (gen === trackGenRef.current) setupLoop(incoming, url); },
    );

    schedulePreload(LIKELY_NEXT[track]);
  }, [cancelCrossfade, startCrossfade, setupLoop, schedulePreload, playAndSetupLoop]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    try { localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped)); } catch {}
    if (!mutedRef.current && elemsRef.current) {
      for (const el of elemsRef.current) {
        if (!el.paused) el.volume = clamped;
      }
      // Keep the in-flight crossfade target in sync so the ramp reaches the
      // correct destination volume.
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
  if (pathname.includes("/play-by-play")) return "interview";
  if (pathname.includes("/report-game")) return "league_management";
  if (pathname.includes("/recruiting") || pathname.includes("/recruit/")) return "recruiting";
  if (pathname.includes("/commissioner") || pathname.includes("/edit-rosters") || pathname.includes("/edit-recruits")) {
    return "graduation";
  }
  if (pathname.includes("/departures") || pathname.includes("/players-leaving") || pathname.includes("/transfer-portal")) {
    return "offseason";
  }
  if (pathname.includes("/commits")) return "predictions";
  if (pathname.includes("/storylines")) return "drama";

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
        if (leaguePhase.startsWith("offseason_recruiting")) return "recruiting";
        return "standings";
    }
  }

  return "standings";
}
