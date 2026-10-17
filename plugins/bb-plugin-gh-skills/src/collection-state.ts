import { useEffect, useLayoutEffect, useState } from "react";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import type { SearchSkill } from "./contract";

type Mode = "browse" | "installed";
type CollectionState = { query: string; owner: string; descending: boolean };
const empty: CollectionState = { query: "", owner: "", descending: false };
const parse = (value: unknown): CollectionState => {
  const state = value as Partial<CollectionState> | null;
  return { query: typeof state?.query === "string" ? state.query : "", owner: typeof state?.owner === "string" ? state.owner : "", descending: state?.descending === true };
};

export function useCollectionState(mode: Mode, isDetail: boolean) {
  const pluginId = experimental_usePluginId();
  const key = `${pluginId}:collections`;
  const route = `/plugins/${encodeURIComponent(pluginId)}/skills`;
  const [states, setStates] = useState(() => {
    let saved: Partial<Record<Mode, CollectionState>> = {};
    try { saved = JSON.parse(sessionStorage.getItem(key) ?? "{}"); } catch { /* Storage can be unavailable. */ }
    const next = { browse: parse(saved?.browse), installed: parse(saved?.installed) };
    if (!isDetail && window.location.pathname.startsWith(route) && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      next[mode] = { query: params.get("query") ?? "", owner: params.get("owner") ?? "", descending: params.get("direction") === "desc" };
    }
    return next;
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(states)); } catch { /* Navigation still works without storage. */ }
  }, [key, states]);
  useEffect(() => {
    const restore = () => {
      if (!window.location.pathname.startsWith(`${route}/`) && window.location.pathname !== route) return;
      const path = window.location.pathname.split("/");
      const nextMode: Mode = path.includes("installed") ? "installed" : "browse";
      const params = new URLSearchParams(window.location.search);
      if (window.history.state?.ghSkillsCollection?.key === key) {
        const remembered = window.history.state.ghSkillsCollection;
        setStates((old) => ({ ...old, [remembered.mode]: parse(remembered.state) }));
      } else if (params.has("query") || params.has("owner") || params.has("direction")) {
        setStates((old) => ({ ...old, [nextMode]: { query: params.get("query") ?? "", owner: params.get("owner") ?? "", descending: params.get("direction") === "desc" } }));
      }
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [key, route]);
  const state = states[mode] ?? empty;
  useLayoutEffect(() => {
    if (isDetail || (!window.location.pathname.startsWith(`${route}/`) && window.location.pathname !== route)) return;
    const url = new URL(window.location.href);
    for (const [name, value] of [["query", state.query], ["owner", mode === "browse" ? state.owner : ""], ["direction", state.descending ? "desc" : ""]]) {
      if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
    }
    // The SDK supports panel paths but not query parameters. Preserve BB's router state.
    window.history.replaceState({ ...window.history.state, ghSkillsCollection: { key, mode, state } }, "", url);
  }, [key, mode, isDetail, state, route]);
  const change = <K extends keyof CollectionState>(field: K, value: CollectionState[K]) => setStates((old) => ({ ...old, [mode]: { ...old[mode], [field]: value } }));
  return { ...state, setQuery: (value: string) => change("query", value), setOwner: (value: string) => change("owner", value), setDescending: (value: boolean) => change("descending", value) };
}

type SearchPage = { skills: SearchSkill[]; page: number; hasMore: boolean; fetchedAt: number };
const searches = new Map<string, SearchPage>();
export const searchKey = (query: string, owner: string) => `${window.location.origin}:${query.trim()}:${owner.trim()}`;
export const cachedSearch = (key: string) => searches.get(key);
export function cacheSearch(key: string, value: SearchPage) {
  searches.delete(key);
  searches.set(key, value);
  if (searches.size > 20) searches.delete(searches.keys().next().value!);
}
