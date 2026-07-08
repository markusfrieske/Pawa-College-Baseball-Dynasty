---
name: Object storage - never trust client-supplied paths
description: The two-part fix for stored-path injection and missing object-level authorization on generic object storage routes.
---

The Replit object-storage boilerplate route (`registerObjectStorageRoutes`) only checks `requireAuth` on the `/objects/*` serving route and never validates what the client sends as `objectPath` when registering an uploaded file against app-level records (e.g. a `game_report_images` row). Left as-is this creates two real vulnerabilities once a feature persists and re-renders that path:

1. **Stored injection**: if `objectPath` is rendered directly into `<a href>`/`<img src>` on the client, an attacker can submit a `javascript:` (or other unsafe-scheme) string instead of a real object path, since nothing on the server validates the value before persisting it.
2. **Missing object-level authz**: `requireAuth` only proves the requester is logged in — any authenticated user can fetch any object if they learn/guess its path, because the generic route doesn't check whether *this* user is allowed to see *that* object.

**How to apply:**
- On the "register uploaded object" endpoint, call the storage service's existing entity-resolution method (e.g. `getObjectEntityFile(objectPath)`) and reject with 400 if it throws (not-found/invalid shape) — this guarantees the string is a real object we control, not an arbitrary attacker string.
- On the generic `/objects/*` serving route, look up the owning application record by object path (e.g. a `getXByObjectPath` storage method) and run the same access-control check used elsewhere for that record's domain (e.g. league-membership/commissioner-or-involved-coach) before streaming the file. Default-deny (404/403) if no matching record exists — don't fall back to "authenticated is enough."

**Why:** This gap is easy to miss because the boilerplate route works perfectly in local testing (you always pass it your own valid path) — the vulnerability only shows up when you use API-driven or adversarial testing that submits invalid/cross-user paths.
