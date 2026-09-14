import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const AUTH_QUERY_KEY = ["/api/auth/me"] as const;

export interface SessionIdentity {
  id: string;
  email: string;
  emailOptOut?: boolean;
}

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        refetchInterval: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  // A signed-out session is valid data, not a failed request that retains the
  // previous identity indefinitely under the shared staleTime setting.
  client.setQueryDefaults(AUTH_QUERY_KEY, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (context) => {
      const identity = await getQueryFn<SessionIdentity | null>({ on401: "returnNull" })(context);
      if (identity === null && !context.signal.aborted) {
        await clearSessionQueries(client, context.signal);
      }
      return identity;
    },
  });
  return client;
}

export const queryClient = createQueryClient();

/** Call after a successful server identity change, before navigating. */
export async function applySessionIdentity(
  identity: SessionIdentity | null,
  client: QueryClient = queryClient,
) {
  await client.cancelQueries();
  await clearSessionQueries(client);
  // Keep this query attached to its observers so the header and navigation
  // update immediately, even when logging out on the current page.
  client.setQueryData(AUTH_QUERY_KEY, identity);
}

async function clearSessionQueries(client: QueryClient, signal?: AbortSignal) {
  const previousSessionQueries = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      !(query.queryKey.length === 1 && query.queryKey[0] === AUTH_QUERY_KEY[0]),
  };
  // The auth request must remain alive to publish its signed-out result.
  await client.cancelQueries(previousSessionQueries);
  // A successful concurrent identity change cancels an obsolete auth request.
  if (signal?.aborted) return;
  // Reset active observers before removing their cached queries. A bare clear()
  // leaves mounted observers displaying the old user's data until a remount.
  for (const query of client.getQueryCache().findAll(previousSessionQueries)) {
    query.reset();
  }
  client.removeQueries(previousSessionQueries);
  client.getMutationCache().clear();
}
