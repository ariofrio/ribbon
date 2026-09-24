import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PullRequestDetailsV1 } from "./contracts";
import type { SidebarPullRequest } from "./pull-request-status";

export interface PullRequestDetailsRequest {
  url: string;
  stamp: string;
}

type LoadDetails = (
  requests: readonly PullRequestDetailsRequest[],
) => Promise<readonly PullRequestDetailsV1[]>;

/** Matches the server cache, so a poll usually finds fresh details. */
const POLL_INTERVAL_MS = 60_000;

/**
 * Collects the pull requests on screen, asks the server for their GitHub
 * details in one batch, and refreshes them on a timer or when bb reports a
 * change.
 */
function createStore(load: LoadDetails) {
  const requested = new Map<string, { stamp: string; rows: number }>();
  const details = new Map<string, PullRequestDetailsV1>();
  const listeners = new Set<() => void>();
  let flushQueued = false;
  let disposed = false;

  function flush() {
    flushQueued = false;
    if (disposed || requested.size === 0) return;
    const requests = [...requested].map(([url, { stamp }]) => ({ url, stamp }));
    load(requests).then(
      (loaded) => {
        if (disposed) return;
        for (const item of loaded) details.set(item.url, item);
        for (const listener of listeners) listener();
      },
      () => {
        // Rows fall back to bb's own attention signal.
      },
    );
  }

  function queueFlush() {
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
  }

  const timer = setInterval(queueFlush, POLL_INTERVAL_MS);

  return {
    register(url: string, stamp: string) {
      const current = requested.get(url);
      requested.set(url, { stamp, rows: (current?.rows ?? 0) + 1 });
      if (current?.stamp !== stamp) queueFlush();
      return () => {
        const entry = requested.get(url);
        if (!entry) return;
        if (entry.rows <= 1) requested.delete(url);
        else requested.set(url, { ...entry, rows: entry.rows - 1 });
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get(url: string) {
      return details.get(url) ?? null;
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
    },
  };
}

type Store = ReturnType<typeof createStore>;

const StoreContext = createContext<Store | null>(null);

export function PullRequestDetailsProvider({
  children,
  load,
}: {
  children: ReactNode;
  load: LoadDetails;
}) {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    const created = createStore(load);
    setStore(created);
    return () => created.dispose();
  }, [load]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

const noSubscription = () => () => {};

/** GitHub details for an open pull request, or null until they load. */
export function usePullRequestDetails(
  pullRequest: SidebarPullRequest | null,
): PullRequestDetailsV1 | null {
  const store = useContext(StoreContext);
  const url = pullRequest?.state === "open" ? pullRequest.url : null;
  const stamp = pullRequest ? `${pullRequest.state}:${pullRequest.attention}` : "";
  useEffect(() => {
    if (!store || url === null) return;
    return store.register(url, stamp);
  }, [store, url, stamp]);
  return useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    () => (store && url !== null ? store.get(url) : null),
  );
}
