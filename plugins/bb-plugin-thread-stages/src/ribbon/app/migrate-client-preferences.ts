import { buildSectionKey } from "../../app/model/section-keys.js";
import { CHRONOLOGICAL_CONTAINER_ID } from "../../app/model/project-thread-groups.js";
import type { PreferenceValues } from "../../shared/preferences.js";
import { LEGACY_SIDEBAR_PREFERENCES_KEY } from "./view-state";

const MIGRATED_KEY = "bb.plugin.thread-stages.migrated-ribbon-client.v1";
const LEGACY_COLLAPSED_THREADS_KEY = "bb.plugin.ribbon-sidebar.collapsedThreads";

/**
 * What this client chose in Ribbon sidebar, expressed as bb's list
 * preferences: which grouping it showed, and which groups and parents it
 * had folded. Read once per client; null when there is nothing to carry.
 */
export function ribbonClientPreferences(
  storage: Pick<Storage, "getItem" | "setItem">,
): Partial<
  Pick<
    PreferenceValues,
    | "organizationMode"
    | "collapsedThreadSections"
    | "collapsedProjects"
    | "collapsedSections"
    | "collapsedThreads"
  >
> | null {
  let raw: string | null;
  let rawThreads: string | null;
  try {
    if (storage.getItem(MIGRATED_KEY) !== null) return null;
    raw = storage.getItem(LEGACY_SIDEBAR_PREFERENCES_KEY);
    rawThreads = storage.getItem(LEGACY_COLLAPSED_THREADS_KEY);
    storage.setItem(MIGRATED_KEY, "1");
  } catch {
    return null;
  }
  if (raw === null && rawThreads === null) return null;
  const migrated: ReturnType<typeof ribbonClientPreferences> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const view = (parsed as { view?: { groupingKey?: unknown } }).view;
      if (view?.groupingKey === "builtin:projects") migrated.organizationMode = "project";
      else if (view?.groupingKey === "builtin:sections") {
        migrated.organizationMode = "chronological";
      }
      const collapsed = (parsed as { collapsed?: unknown }).collapsed;
      if (Array.isArray(collapsed)) {
        const sections: string[] = [];
        const projects: string[] = [];
        const builtIn: ("pinned" | "threads")[] = [];
        for (const ref of collapsed) {
          if (typeof ref !== "string") continue;
          if (ref === "builtin:pinned") builtIn.push("pinned");
          else if (ref === "builtin:sections/unsectioned") builtIn.push("threads");
          else if (ref.startsWith("builtin:sections/")) {
            sections.push(
              buildSectionKey(CHRONOLOGICAL_CONTAINER_ID, ref.slice("builtin:sections/".length)),
            );
          } else if (ref.startsWith("builtin:projects/")) {
            projects.push(ref.slice("builtin:projects/".length));
          }
        }
        if (sections.length > 0) migrated.collapsedThreadSections = sections;
        if (projects.length > 0) migrated.collapsedProjects = projects;
        if (builtIn.length > 0) migrated.collapsedSections = builtIn;
      }
    }
  } catch {
    // A mangled Ribbon record carries nothing over.
  }
  try {
    const threads: unknown = rawThreads === null ? null : JSON.parse(rawThreads);
    if (Array.isArray(threads)) {
      const ids = threads.filter((id): id is string => typeof id === "string");
      if (ids.length > 0) migrated.collapsedThreads = ids;
    }
  } catch {
    // Same.
  }
  return Object.keys(migrated).length > 0 ? migrated : null;
}
