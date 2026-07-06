---
name: Skeleton loaders look "blank" to e2e tests
description: Why a browser test can report a fully blank page even when the app is working, when the page is still on a Skeleton-only loading state.
---

Pages that render a pure `<Skeleton />`-based loading state (no text, no ARIA roles) are indistinguishable from a truly blank/crashed page in an accessibility-tree-based browser test snapshot. If a page load is slow (e.g. cold Vite dev-server compile of a route/chunk that hasn't been visited yet in that session), a test can time out while `isLoading` is still true and report "blank page, no console errors" — which looks identical to a real rendering bug.

**Why:** Skeleton components are typically just `<div className="animate-pulse bg-muted rounded" />` with no text or role, so accessibility-tree/aria-snapshot based test tooling sees nothing to report even though the DOM has content and no error occurred.

**How to apply:** Before concluding a genuine rendering bug from a browser test that shows a "blank page" with zero console/network errors and a correct URL, first: (1) check whether the page has a Skeleton-based loading state that could explain a text-less snapshot, and (2) retry the test with a longer wait / after the route has already been warmed up once in the dev server. If a retry with patience passes cleanly, it was very likely a cold-compile/loading-state artifact, not a code defect.
