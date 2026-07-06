---
name: E2E cookie-auth bootstrap for member-only pages
description: How to quickly reach an authenticated, member-only UI state in a Playwright smoke test without the slow full UI onboarding flow.
---

When a page behaves differently for members vs. non-members of a resource (e.g. a league/team/org), and the full UI signup+onboarding flow is too slow or flaky under load to use in every smoke test, bootstrap the resource via direct API calls first, then hand the resulting session to the Playwright browser.

**How to apply:**
1. From `code_execution` (or any HTTP client), call the app's own auth/session endpoints directly (e.g. guest login), capturing the `Set-Cookie` session value.
2. Drive whatever create/setup API endpoints are needed to reach the desired state (e.g. create league → select teams → start → assign coach), all with that same cookie attached.
3. In the Playwright test plan, do NOT use `context.addCookies()` with just a cookie name/value — it errors with "Cookie should have either url or path" unless you also supply a matching `url` or `domain`+`path`. The reliable approach: navigate to the app root first, then run `page.evaluate(() => { document.cookie = "connect.sid=<value>; path=/" })`, then navigate to the target URL. The browser will now send that cookie on same-origin requests, authenticating as the bootstrapped session.
4. This lets a smoke test verify authenticated/member-only rendering in seconds instead of minutes, and avoids re-triggering non-member-only edge cases/bugs that are out of scope.

Caveat: `code_execution` notebook state (variables like captured cookies/IDs) can be lost if the sandbox restarts — capture and use the cookie within the same session, or redo the bootstrap if state is lost.
