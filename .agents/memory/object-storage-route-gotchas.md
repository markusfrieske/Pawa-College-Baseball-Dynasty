---
name: Object storage route registration & wildcard syntax
description: Two easy-to-miss failure modes when wiring up the object storage upload/serve routes in this stack.
---

1. **Registration is not automatic.** `registerObjectStorageRoutes(app)` (in `server/replit_integrations/object_storage/routes.ts`) must be explicitly imported and called from the main route registration function (`server/routes.ts`). It is easy to gate/edit the route handlers (e.g. adding `requireAuth`) without noticing the registration call itself is missing — the routes then silently 404 through to the SPA catch-all (client HTML is returned with a 200 status, not a 404), which looks like a client/network issue rather than a missing route.

**Why:** Found via API-driven verification — `POST /api/uploads/request-url` returned HTML instead of JSON with a 200 status, masking the real problem.

**How to apply:** After adding or editing object storage routes, do a raw `fetch`/curl check that the response is actually JSON, not just checking the status code. Also grep for the `register*Routes(app)` call sites to confirm the module is wired in.

2. **Wildcard path syntax changed in path-to-regexp v7+.** The old Express/Replit boilerplate example route `app.get("/objects/:objectPath(*)", ...)` throws a hard startup crash (`PathError: Missing parameter name`) on newer path-to-regexp. Use `app.get("/objects/*objectPath", ...)` instead.

**Why:** This is a breaking syntax change in the `path-to-regexp` dependency, not an Express-level issue — old skill/boilerplate snippets referencing `:param(*)` are stale for current dependency versions in this project.

**How to apply:** When adding any wildcard/catch-all Express route, use the `*paramName` syntax, not `:paramName(*)`.
