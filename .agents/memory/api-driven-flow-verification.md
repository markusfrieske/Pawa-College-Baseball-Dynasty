---
name: API-driven flow verification for large-league features
description: When verifying multi-step league flows (create → team-selection → setup → start → dashboard), drive them via direct API calls instead of a large browser test plan.
---

Browser-based e2e test plans that click through team-selection for large leagues (e.g. 16-18 teams) tend to time out or report "unable" purely due to step count/scale, not actual app bugs — making them unreliable as a verification signal for backend correctness.

**Why:** A scripted API flow (register → create league → team-selection → coach setup → start → fetch dashboard/roster/recruiting) using `fetch` + a manual cookie jar in the code_execution sandbox is deterministic, fast, and isolates backend bugs from UI/test-plan scale issues. This approach caught a real bug (a function used in a route handler without being imported) that a flaky browser test would have misattributed to "test scale".

**How to apply:** For verifying multi-league or large-roster features, prefer a small (5-6 team) league driven end-to-end via API calls first. Only fall back to a lightweight browser test afterward to visually confirm rendering, once the API flow is confirmed correct.
