import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useUpdateAtmospherePhase, useSetAtmosphereBurstColor } from "@/components/atmosphere-provider";
import { queryClient } from "@/lib/queryClient";

interface TeamData {
  primaryColor?: string | null;
  coach?: { userId: string } | null;
}

interface LeagueData {
  currentPhase: string;
  teams?: TeamData[];
}

interface AuthData {
  id: string;
}

function isLeagueData(data: unknown): data is LeagueData {
  return (
    typeof data === "object" &&
    data !== null &&
    "currentPhase" in data &&
    typeof (data as Record<string, unknown>).currentPhase === "string"
  );
}

function isAuthData(data: unknown): data is AuthData {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof (data as Record<string, unknown>).id === "string"
  );
}

/** League IDs that are actually static routes — never fetch these as real league IDs. */
const STATIC_LEAGUE_SEGMENTS = new Set(["create"]);

export function AtmosphereRouter() {
  const [location] = useLocation();
  const updateAtmospherePhase = useUpdateAtmospherePhase();
  const setAtmosphereBurstColor = useSetAtmosphereBurstColor();
  const cachedPhaseRef = useRef<{ leagueId: string; phase: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyLeagueData = useCallback(
    (leagueId: string, league: LeagueData) => {
      cachedPhaseRef.current = { leagueId, phase: league.currentPhase };
      updateAtmospherePhase(league.currentPhase);

      if (Array.isArray(league.teams)) {
        const authData = queryClient.getQueryData<AuthData>(["/api/auth/me"]);
        if (isAuthData(authData)) {
          const myTeam = league.teams.find((t) => t.coach?.userId === authData.id);
          if (myTeam?.primaryColor) {
            setAtmosphereBurstColor(myTeam.primaryColor);
          }
        }
      }
    },
    [updateAtmospherePhase, setAtmosphereBurstColor],
  );

  const fetchAndSetPhase = useCallback(
    (leagueId: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/leagues/${leagueId}`, { credentials: "include", signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("fetch failed");
          return res.json();
        })
        .then((league: unknown) => {
          if (controller.signal.aborted) return;
          abortRef.current = null;
          if (isLeagueData(league)) {
            applyLeagueData(leagueId, league);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") {
            abortRef.current = null;
          }
        });
    },
    [applyLeagueData],
  );

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        const queryKey = event.query.queryKey;
        if (
          Array.isArray(queryKey) &&
          queryKey[0] === "/api/leagues" &&
          queryKey.length === 2 &&
          typeof queryKey[1] === "string"
        ) {
          const data = event.query.state.data;
          if (isLeagueData(data)) {
            const leagueId = queryKey[1];
            const oldPhase =
              cachedPhaseRef.current?.leagueId === leagueId
                ? cachedPhaseRef.current.phase
                : null;
            if (oldPhase !== data.currentPhase) {
              applyLeagueData(leagueId, data);
            }
          }
        }
      }
    });

    return () => {
      unsubscribe();
      if (abortRef.current) abortRef.current.abort();
    };
  }, [applyLeagueData]);

  useEffect(() => {
    const leagueMatch = location.match(/^\/league\/([^/]+)/);

    if (!leagueMatch || STATIC_LEAGUE_SEGMENTS.has(leagueMatch[1])) {
      if (abortRef.current) abortRef.current.abort();
      cachedPhaseRef.current = null;
      updateAtmospherePhase("neutral");
      return;
    }

    const leagueId = leagueMatch[1];

    if (cachedPhaseRef.current?.leagueId === leagueId) {
      return;
    }

    const cached = queryClient.getQueryData<LeagueData>(["/api/leagues", leagueId]);
    if (cached && isLeagueData(cached)) {
      applyLeagueData(leagueId, cached);
    } else {
      fetchAndSetPhase(leagueId);
    }
  }, [location, updateAtmospherePhase, applyLeagueData, fetchAndSetPhase]);

  return null;
}
