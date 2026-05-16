import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useUpdateAtmospherePhase } from "@/components/atmosphere-provider";
import { queryClient } from "@/lib/queryClient";

export function AtmosphereRouter() {
  const [location] = useLocation();
  const updateAtmospherePhase = useUpdateAtmospherePhase();
  const cachedPhaseRef = useRef<{ leagueId: string; phase: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        .then((league) => {
          if (controller.signal.aborted) return;
          abortRef.current = null;
          if (league?.currentPhase) {
            cachedPhaseRef.current = { leagueId, phase: league.currentPhase };
            updateAtmospherePhase(league.currentPhase);
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError") abortRef.current = null;
        });
    },
    [updateAtmospherePhase],
  );

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && (event.action as any).type === "success") {
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
            const oldPhase =
              cachedPhaseRef.current?.leagueId === leagueId
                ? cachedPhaseRef.current.phase
                : null;
            if (oldPhase !== data.currentPhase) {
              cachedPhaseRef.current = { leagueId, phase: data.currentPhase };
              updateAtmospherePhase(data.currentPhase);
            }
          }
        }
      }
    });

    return () => {
      unsubscribe();
      if (abortRef.current) abortRef.current.abort();
    };
  }, [updateAtmospherePhase]);

  useEffect(() => {
    const leagueMatch = location.match(/^\/league\/([^/]+)/);

    if (!leagueMatch) {
      cachedPhaseRef.current = null;
      updateAtmospherePhase("neutral");
      return;
    }

    const leagueId = leagueMatch[1];

    if (cachedPhaseRef.current?.leagueId === leagueId) {
      return;
    }

    const cached = queryClient.getQueryData(["/api/leagues", leagueId]) as any;
    if (cached?.currentPhase) {
      cachedPhaseRef.current = { leagueId, phase: cached.currentPhase };
      updateAtmospherePhase(cached.currentPhase);
    } else {
      fetchAndSetPhase(leagueId);
    }
  }, [location, updateAtmospherePhase, fetchAndSetPhase]);

  return null;
}
