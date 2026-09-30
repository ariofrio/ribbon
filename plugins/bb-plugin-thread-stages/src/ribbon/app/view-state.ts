export type PullRequestNumberPosition = "right" | "hidden";
/** What this client chooses for itself, apart from bb's own list preferences. */
export type SidebarView = {
  pullRequestNumberPosition: PullRequestNumberPosition;
};
export interface SidebarPreferences {
  view: SidebarView;
}

export const SIDEBAR_PREFERENCES_KEY =
  "bb.plugin.thread-stages.preferences.v1";
/** Ribbon sidebar's key, read once so this client keeps what it chose there. */
export const LEGACY_SIDEBAR_PREFERENCES_KEY =
  "bb.plugin.ribbon-sidebar.preferences.v1";

/**
 * The view a stored record holds, or null where there is none to read. Ribbon
 * kept far more here — scope, grouping, filters, sort, hidden kinds — and bb's
 * own preferences carry all of that now, so only the number placement is read.
 */
function storedView(raw: string | null): SidebarView | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const view = (value as Record<string, unknown>).view;
    if (typeof view !== "object" || view === null) return null;
    const position = (view as Record<string, unknown>).pullRequestNumberPosition;
    return {
      // Ribbon also placed the number on the left; that is the right now.
      pullRequestNumberPosition: position === "hidden" ? "hidden" : "right",
    };
  } catch {
    return null;
  }
}

export function saveSidebarPreferences(
  storage: Storage,
  preferences: SidebarPreferences,
) {
  try {
    storage.setItem(SIDEBAR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Client-local choices still work for this mount when storage is blocked.
  }
}

export function loadSidebarPreferences(storage: Storage): SidebarPreferences {
  let view: SidebarView | null = null;
  try {
    view =
      storedView(storage.getItem(SIDEBAR_PREFERENCES_KEY)) ??
      storedView(storage.getItem(LEGACY_SIDEBAR_PREFERENCES_KEY));
  } catch {
    /* Use defaults when storage is unavailable. */
  }
  const preferences: SidebarPreferences = {
    view: { pullRequestNumberPosition: view?.pullRequestNumberPosition ?? "right" },
  };
  saveSidebarPreferences(storage, preferences);
  return preferences;
}
