import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMusic, resolveTrackForRoute } from "@/lib/music-context";

export function MusicRouter() {
  const [location] = useLocation();
  const { setTrack } = useMusic();
  const cachedPhaseRef = useRef<{ leagueId: string; phase: string } | null>(null);
  const fetchingRef = useRef<string | null>(null);

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
    }

    if (fetchingRef.current === leagueId) return;

    let cancelled = false;
    fetchingRef.current = leagueId;

    fetch(`/api/leagues/${leagueId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch league");
        return res.json();
      })
      .then((league) => {
        if (cancelled) return;
        cachedPhaseRef.current = { leagueId, phase: league.currentPhase };
        fetchingRef.current = null;
        const track = resolveTrackForRoute(location, league.currentPhase);
        setTrack(track);
      })
      .catch(() => {
        if (cancelled) return;
        fetchingRef.current = null;
        const track = resolveTrackForRoute(location, cachedPhaseRef.current?.phase);
        setTrack(track);
      });

    return () => {
      cancelled = true;
    };
  }, [location, setTrack]);

  return null;
}
