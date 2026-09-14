# Authorization route-order verification — TI-01 and TI-02

Source revision: `8a1e113070c1e809da83cc66fc7eb84ffb9bec21`.
Method: inspected every `app.use`, `app.all`, `app.param`, and `router.use` occurrence under `server`, then traced registration order. This is static verification; no live requests or database queries were issued.

## Middleware encountered before the affected API handlers

1. `server/index.ts:73`: conditional JSON body parser, then `:87` URL-encoded parser.
2. `server/index.ts:102`: development-only cache headers.
3. `server/index.ts:127`: response logging with path normalization/user hash.
4. `server/index.ts:1147`: proxy scoped only to `/__mockup`; does not match `/api`.
5. `server/index.ts:1162`: calls `registerRoutes`.
6. `server/routes.ts:438`: Helmet/security response headers.
7. `server/routes.ts:472`: express-session with PostgreSQL store and cookie configuration.
8. `server/routes.ts:514`: registers game routes; `:526` registers simulation routes; `:852` registers the league GET handler.

No global or mounted league-membership/commissioner authorization middleware exists before these handlers. Every domain route module was included in the middleware search; none installs a hidden global membership gate. The error handler (`server/index.ts:1332`) and production static/development Vite fallback (`:1348-1352`) are registered afterward and do not authorize handled API requests.

## Endpoint conclusions

- `GET /api/leagues/:id`: inline `requireAuth` at `server/routes.ts:147` requires session userId OR isGuest and calls next. Handler at `:852-899` contains no membership test. Cache return at `:858-859` happens before even the league fetch; cold-cache payload includes coach user emails (`:875-889`).
- `GET /api/leagues/:id/schedule`: shared `requireAuth` in `server/route-helpers.ts:25` has the same authentication-only semantics. Handler (`server/routes/games.ts:86-194`) does not authorize membership; `:174-176` computes userTeamId/isCommissioner for display, but neither value is used as a denial condition. It returns games and report metadata including disputeReason at `:136-148` and `:179-189`.
- `POST /api/leagues/:id/games/:gameId/finalize-play-by-play`: `server/routes/simulation.ts:7164-7269` uses requireAuth plus global PBP_ENABLED flag; no membership, participant, commissioner, game mode, current-phase, or server-owned simulation-session check is present. The body is accepted as result authority and reaches `finalizeGameAtomic` at `:7257`.
- `finalizeGameAtomic` (`server/game-finalizer.ts:1144-1332`) accepts no requesting actor or authorization context. It locks the game and checks the finalization sentinel, but cannot supply the missing actor authorization. These are persistence protections, not permission checks.

The PBP finding is explicitly conditional on `PBP_ENABLED=true`; flag off returns 404. The league and schedule disclosures do not depend on that flag. Cookie SameSite and Helmet do not stop an authenticated outsider from making their own same-origin request.
