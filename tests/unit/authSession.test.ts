import { test, expect } from "@playwright/test";
import { focusManager, QueryObserver } from "@tanstack/react-query";
import {
  applySessionIdentity,
  AUTH_QUERY_KEY,
  createQueryClient,
} from "../../client/src/lib/queryClient";

const originalFetch = globalThis.fetch;
let client: ReturnType<typeof createQueryClient>;
test.beforeEach(() => { client = createQueryClient(); });
test.afterEach(() => {
  client.unmount();
  client.clear();
  focusManager.setFocused(undefined);
  globalThis.fetch = originalFetch;
});

test("account A -> logout -> account B drops private data and updates mounted observers", async () => {
  const accountA = { id: "coach-a", email: "a@example.test" };
  const accountB = { id: "coach-b", email: "b@example.test" };
  await applySessionIdentity(accountA, client);
  client.setQueryData(["/api/leagues"], [{ id: "a-private-league" }]);
  client.setQueryData(["/api/saved-rosters"], [{ id: "a-private-roster" }]);
  const authObserver = new QueryObserver(client, { queryKey: AUTH_QUERY_KEY });
  const leagueObserver = new QueryObserver(client, { queryKey: ["/api/leagues"] });
  const unsubscribeAuth = authObserver.subscribe(() => {});
  const unsubscribeLeague = leagueObserver.subscribe(() => {});
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => ({ privateDraft: "account A" }),
  });
  await mutation.execute(undefined);

  await applySessionIdentity(null, client);
  expect(authObserver.getCurrentResult().data).toBeNull();
  expect(leagueObserver.getCurrentResult().data).toBeUndefined();
  expect(client.getQueryData(["/api/leagues"])).toBeUndefined();
  expect(client.getQueryData(["/api/saved-rosters"])).toBeUndefined();
  expect(client.getMutationCache().getAll()).toHaveLength(0);

  await applySessionIdentity(accountB, client);
  expect(authObserver.getCurrentResult().data).toEqual(accountB);
  expect(client.getQueryCache().getAll()).toHaveLength(1);
  globalThis.fetch = async () => Response.json([{ id: "b-private-league" }]);
  expect(await client.fetchQuery({ queryKey: ["/api/leagues"] }))
    .toEqual([{ id: "b-private-league" }]);
  // useQuery updates its observer options after the identity-driven rerender.
  leagueObserver.setOptions({ queryKey: ["/api/leagues"] });
  expect(leagueObserver.getCurrentResult().data).toEqual([{ id: "b-private-league" }]);
  unsubscribeAuth();
  unsubscribeLeague();
});

test("guest identity replaces a signed-in coach's cached league and auth state", async () => {
  client.setQueryData(AUTH_QUERY_KEY, { id: "coach-a", email: "a@example.test" });
  client.setQueryData(["/api/leagues", "league-a", "schedule"], { privateReport: "A" });
  const guest = { id: "guest-test", email: "guest-test@guest.local", emailOptOut: false };
  await applySessionIdentity(guest, client);
  expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(guest);
  expect(client.getQueryData(["/api/leagues", "league-a", "schedule"])).toBeUndefined();
});

test("expired auth clears mounted private data and prevents late responses from restoring it", async () => {
  client.setQueryData(AUTH_QUERY_KEY, { id: "coach-a", email: "a@example.test" });
  client.setQueryData(["/api/leagues"], [{ id: "a-private-league" }]);
  const observer = new QueryObserver(client, { queryKey: AUTH_QUERY_KEY });
  const unsubscribe = observer.subscribe(() => {});
  const leagueObserver = new QueryObserver(client, { queryKey: ["/api/leagues"] });
  const unsubscribeLeague = leagueObserver.subscribe(() => {});
  let privateSignal: AbortSignal | null | undefined;
  let finishPrivateRequest!: (response: Response) => void;
  globalThis.fetch = async (url, options) => {
    expect(options?.credentials).toBe("include");
    if (url === "/api/saved-rosters") {
      privateSignal = options.signal;
      return new Promise<Response>(resolve => { finishPrivateRequest = resolve; });
    }
    return new Response("Not authenticated", { status: 401 });
  };
  const pendingPrivateRequest = client.fetchQuery({ queryKey: ["/api/saved-rosters"] }).catch(error => error);
  await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  expect(observer.getCurrentResult().data).toBeNull();
  expect(observer.getCurrentResult().status).toBe("success");
  expect(leagueObserver.getCurrentResult().data).toBeUndefined();
  expect(client.getQueryData(["/api/leagues"])).toBeUndefined();
  expect(privateSignal?.aborted).toBe(true);
  finishPrivateRequest(Response.json([{ privateRoster: "old coach" }]));
  await pendingPrivateRequest;
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(["/api/saved-rosters"])).toBeUndefined();
  unsubscribe();
  unsubscribeLeague();
});

test("non-auth 401 and unexpected auth failures remain errors", async () => {
  globalThis.fetch = async () => new Response("Not authenticated", { status: 401 });
  await expect(client.fetchQuery({ queryKey: ["/api/leagues"] })).rejects.toThrow("401:");
  const identity = { id: "coach-a", email: "a@example.test" };
  client.setQueryData(AUTH_QUERY_KEY, identity);
  client.setQueryData(["/api/leagues"], [{ id: "a-private-league" }]);
  await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
  await expect(client.fetchQuery({ queryKey: AUTH_QUERY_KEY })).rejects.toThrow("503:");
  expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(identity);
  expect(client.getQueryData(["/api/leagues"])).toEqual([{ id: "a-private-league" }]);
});

test("returning focus rechecks a session older than thirty seconds", async () => {
  const identity = { id: "coach-a", email: "a@example.test" };
  client.setQueryData(AUTH_QUERY_KEY, identity);
  client.mount();
  const observer = new QueryObserver(client, { queryKey: AUTH_QUERY_KEY });
  const unsubscribe = observer.subscribe(() => {});
  focusManager.setFocused(false);
  client.setQueryData(AUTH_QUERY_KEY, identity, { updatedAt: Date.now() - 31_000 });
  globalThis.fetch = async () => new Response("Not authenticated", { status: 401 });
  focusManager.setFocused(true);
  await expect.poll(() => observer.getCurrentResult().data).toBeNull();
  unsubscribe();
});

test("identity change aborts default fetches and ignores late private responses", async () => {
  let requestSignal: AbortSignal | null | undefined;
  let finishRequest!: (response: Response) => void;
  globalThis.fetch = async (_url, options) => {
    requestSignal = options?.signal;
    return new Promise<Response>(resolve => { finishRequest = resolve; });
  };
  const oldRequest = client.fetchQuery({ queryKey: ["/api/leagues"] }).catch(error => error);
  expect(requestSignal?.aborted).toBe(false);
  await applySessionIdentity({ id: "coach-b", email: "b@example.test" }, client);
  expect(requestSignal?.aborted).toBe(true);
  // Deliberately emulate a transport that ignores abort and delivers A's result.
  finishRequest(Response.json([{ id: "a-private-league" }]));
  await oldRequest;
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(client.getQueryData(["/api/leagues"])).toBeUndefined();
  expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual({ id: "coach-b", email: "b@example.test" });
});
