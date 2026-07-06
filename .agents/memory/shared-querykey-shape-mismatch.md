---
name: Shared React Query cache key with mismatched response shapes
description: A pre-existing bug pattern in this codebase where multiple components share a queryKey but expect different response shapes for the same endpoint.
---

`["/api/leagues", leagueId, "events"]` is used as the React Query cache key by three separate components in the league-view page (the "Since Last Advance" activity feed, the activity-widgets feed, and the notification center). They expect different response shapes for the same endpoint's success payload (raw array vs. `{ events: [...] }`), and none of them guard against the endpoint returning a 403 error object when the viewer is not a league member.

Result: for a non-member viewer, `GET /api/leagues/:id/events` returns a 403 error body, and whichever component's cache read hits that shape first can crash with `(events ?? []).slice is not a function`.

**Why:** confirmed via diff against the pre-refactor monolithic `league-view.tsx` that this exact collision exists byte-for-byte in the original file too — it is not a regression from any later refactor, it's a long-standing latent bug that only manifests for non-member viewers.

**How to apply:** If you ever touch the events-feed components, give each consumer its own distinct queryKey (e.g. suffix with a component-specific tag) and normalize the fetcher to always return the same shape (or throw) regardless of membership status, so a 403 doesn't get cached as usable data for a differently-shaped consumer. This was intentionally left unfixed in a prior refactor task since it was out of scope; treat it as a candidate follow-up fix, not new information to rediscover.
