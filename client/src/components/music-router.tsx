import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMusic, resolveTrackForRoute } from "@/lib/music-context";
import { queryClient } from "@/lib/queryClient";

export function MusicRouter() {
  const [location] = useLocation();
  const { setTrack } = useMusic();
  const cachedPhaseRef = useRef<{ leagueId: string; phase: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAndSetPhase = useCallback((leagueId: string, currentLocation: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/leagues/${leagueId}`, { credentials: "include", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch league");
        return res.json();
      })
      .then((league) => {
        if (controller.signal.aborted) return;
        abortRef.current = null;
        cachedPhaseRef.current = { leagueId, phase: league.currentPhase };
        const track = resolveTrackForRoute(currentLocation, league.currentPhase);
        setTrack(track);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          abortRef.current = null;
        }
      });
  }, [setTrack]);

  useEffect(() => {
    const handler = () => {
      const leagueMatch = window.location.pathname.match(/^\/league\/([^/]+)/);
      if (leagueMatch) {
        cachedPhaseRef.current = null;
        fetchAndSetPhase(leagueMatch[1], window.location.pathname);
      }
    };

    window.addEventListener("league-phase-changed", handler);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        const queryKey = event.query.queryKey;
        if (
          Array.isArray(queryKey) &&
          queryKey[0] === "/api/leagues" &&
          queryKey.length === 2 &&
          typeof queryKey[1] === "string"
        ) {
          const data = event.query.state.data as any;
          if (data?.currentPhase) {
            const leagueId = queryKey[1] as string;
            const oldPhase = cachedPhaseRef.current?.leagueId === leagueId ? cachedPhaseRef.current.phase : null;
            if (oldPhase !== data.currentPhase) {
              cachedPhaseRef.current = { leagueId, phase: data.currentPhase };
              const track = resolveTrackForRoute(window.location.pathname, data.currentPhase);
              setTrack(track);
            }
          }
        }
      }
    });

    return () => {
      window.removeEventListener("league-phase-changed", handler);
      unsubscribe();
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchAndSetPhase, setTrack]);

  useEffect(() => {
    const leagueMatch = location.match(/^\/league\/([^/]+)/);

    if (!leagueMatch) {
      const track = resolveTrackForRoute(location);
      setTrack(track);
      return;
    }

    const leagueId = leagueMatch[1];

    const screenSpecificRoutes = [
      "/recruiting", "/recruit/", "/commissioner",
      "/edit-rosters", "/edit-recruits", "/departures",
      "/players-leaving", "/transfer-portal", "/commits",
      "/dynasty-setup", "/league-setup", "/team-selection",
      "/storylines", "/report-game",
    ];
    const isScreenSpecific = screenSpecificRoutes.some(r => location.includes(r));

    if (isScreenSpecific) {
      const track = resolveTrackForRoute(location);
      setTrack(track);
      return;
    }

    if (cachedPhaseRef.current && cachedPhaseRef.current.leagueId === leagueId) {
      const track = resolveTrackForRoute(location, cachedPhaseRef.current.phase);
      setTrack(track);
      // Phase already cached — no need to fetch again
      return;
    }

    fetchAndSetPhase(leagueId, location);
  }, [location, setTrack, fetchAndSetPhase]);

  return null;
}
