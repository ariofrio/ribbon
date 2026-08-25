import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { announceIconsChanged, ICONS_CHANNEL } from "./broadcast";
import {
  iconFor,
  type CatalogEntryView,
  type IconsRpc,
  type IconsState,
} from "./icons-client";
import { projectLookup, type ProjectLookup } from "./project-lookup";
import { type IconColor, type IconOwner } from "./store";

export interface IconsController {
  state: IconsState | null;
  /** Resolves a drawn project name, for the rows that carry only a name. */
  projects: ProjectLookup;
  /** Fetches the state again now, for a caller that knows it is behind. */
  reload(): void;
  catalog: readonly CatalogEntryView[];
  loadingCatalog: boolean;
  /** Fetches the catalog once, the first time a picker is approached. */
  loadCatalog(): void;
  apply(owner: IconOwner, next: { icon?: string; color?: IconColor | null }): void;
  reset(owner: IconOwner): void;
}

const NO_PROJECTS = projectLookup([]);

/**
 * Everything the content script's half of the plugin knows, fetched once for
 * every place it draws.
 *
 * One controller serves both the sidebar headers and the icons drawn over
 * bb's own — a second would mean a second fetch, a second broadcast listener,
 * and two copies of the state that could briefly disagree.
 */
export function useIcons(rpc: IconsRpc): IconsController {
  const [state, setState] = useState<IconsState | null>(null);
  const [catalog, setCatalog] = useState<readonly CatalogEntryView[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const refresh = useCallback(async () => {
    const next = await rpc.list();
    if (next !== null) setState(next);
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The thread header and other windows announce their edits here, and bb
  // publishes nothing about sections, so a focus check covers the rest.
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(ICONS_CHANNEL);
      channel.onmessage = () => void refresh();
    } catch {
      // Clients without BroadcastChannel still refresh on focus.
    }
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      channel?.close();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  /**
   * The backend fills its project list off the read path, so a client can read
   * the state before the list is in it. It says so, and this waits for that to
   * change rather than for a length of time — a guess would be wrong on the
   * machine that is busy, and wrong permanently rather than briefly.
   */
  useEffect(() => {
    if (state === null || state.projectsRead !== false) return;
    const timer = setTimeout(() => void refresh(), 1000);
    return () => clearTimeout(timer);
  }, [refresh, state]);

  const loadCatalog = useCallback(() => {
    if (catalog.length > 0 || loadingCatalog) return;
    setLoadingCatalog(true);
    void rpc
      .listCatalog()
      .then((next) => {
        if (next !== null) setCatalog(next.icons);
      })
      .finally(() => setLoadingCatalog(false));
  }, [catalog.length, loadingCatalog, rpc]);

  const apply = useCallback(
    (owner: IconOwner, next: { icon?: string; color?: IconColor | null }) => {
      const current = iconFor(state, owner);
      const icon = next.icon ?? current.name;
      const color = next.color === undefined ? current.color : next.color;
      const glyph =
        catalog.find((entry) => entry.name === icon)?.glyph ?? current.glyph ?? [];
      setState((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              icons: [
                ...previous.icons.filter(
                  (item) => !(item.kind === owner.kind && item.id === owner.id),
                ),
                { ...owner, icon, color, glyph },
              ],
            },
      );
      announceIconsChanged();
      void rpc.set({ ...owner, icon, color }).then((result) => {
        if (result === null) void refresh();
      });
    },
    [catalog, refresh, rpc, state],
  );

  const reset = useCallback(
    (owner: IconOwner) => {
      setState((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              icons: previous.icons.filter(
                (item) => !(item.kind === owner.kind && item.id === owner.id),
              ),
            },
      );
      announceIconsChanged();
      void rpc.clear(owner).then((result) => {
        if (result === null) void refresh();
      });
    },
    [refresh, rpc],
  );

  // Keyed on what the list says, not on the array it arrived in: every fetch
  // brings a fresh array, and a lookup that changed identity on each one would
  // have every reader treat an unchanged list as news.
  const listed = state?.projects;
  const signature =
    listed === undefined
      ? null
      : listed.map((project) => `${project.id}\u0000${project.name}`).join("\u0001");
  const projects = useMemo(
    () => (signature === null ? NO_PROJECTS : projectLookup(listed ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature is the list
    [signature],
  );

  const reload = useCallback(() => void refresh(), [refresh]);

  return {
    state,
    projects,
    reload,
    catalog,
    loadingCatalog,
    loadCatalog,
    apply,
    reset,
  };
}
