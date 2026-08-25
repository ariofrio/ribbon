import type { IconSvgElement } from "@hugeicons/react";
import type { ProjectSummary } from "./project-lookup";
import type {
  IconColor,
  IconOwner,
  PlacementSetting,
  StoredIcon,
} from "./store";

/** Stamped by `bb plugin build`; undefined in tests and registry copies. */
declare const __BB_PLUGIN_ID__: string | undefined;

export interface IconView extends StoredIcon {
  glyph: IconSvgElement;
}

export interface IconsState {
  icons: IconView[];
  defaults: {
    project: IconSvgElement;
    personal: IconSvgElement;
    section: IconSvgElement;
  };
  /**
   * Which project bb calls personal. Optional for the same reason as the
   * fields below: an older backend than the app does not send it.
   */
  personalProjectId?: string | null;
  /**
   * bb's projects, by id and name. Optional because an older backend than the
   * app — a client left open across a plugin update — sends the state without
   * it, and a row that resolves to nothing keeps bb's own folder.
   */
  projects?: ProjectSummary[];
  /**
   * Whether the backend has read that list yet. Absent from a backend older
   * than the app, where an empty list is taken at its word.
   */
  projectsRead?: boolean;
}

/** Which of the plugin's drawings the user has left on. */
export type PlacementFlags = Record<PlacementSetting, boolean>;

export interface CatalogEntryView {
  name: string;
  category: string;
  tags: string[];
  glyph: IconSvgElement;
}

/**
 * The same RPC the thread header reaches through `useRpc`, over plain fetch.
 *
 * The sidebar icons are drawn from a content script, which runs outside bb's
 * React provider tree, so none of the SDK hooks are available there — this is
 * the only way that half of the plugin can talk to its own backend. Thread
 * stages already reads this plugin the same way.
 */
export function iconsRpc(pluginId?: string) {
  const id =
    pluginId ??
    (typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : "icons");

  const call = async <Result>(
    method: string,
    input: unknown,
  ): Promise<Result | null> => {
    try {
      const response = await fetch(`/api/v1/plugins/${id}/rpc/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const envelope = (await response.json()) as
        | { ok: true; result: Result }
        | { ok: false };
      return envelope.ok ? envelope.result : null;
    } catch {
      // The sidebar keeps its last drawing rather than throwing into bb's own
      // render; a backend hiccup must never take the sidebar down.
      return null;
    }
  };

  return {
    list: () => call<IconsState>("listIcons", null),
    listPlacements: () => call<PlacementFlags>("listPlacements", null),
    listCatalog: () => call<{ icons: CatalogEntryView[] }>("listIconCatalog", null),
    set: (icon: IconOwner & { icon: string; color: IconColor | null }) =>
      call<IconsState>("setIcon", icon),
    clear: (owner: IconOwner) => call<IconsState>("clearIcon", owner),
  };
}

export type IconsRpc = ReturnType<typeof iconsRpc>;

/** Looks up one owner's drawing, falling back to the kind's default. */
export function iconFor(
  state: IconsState | null,
  owner: IconOwner,
): { name: string; glyph: IconSvgElement | undefined; color: IconColor | null } {
  const chosen = state?.icons.find(
    (item) => item.kind === owner.kind && item.id === owner.id,
  );
  if (chosen !== undefined) {
    return { name: chosen.icon, glyph: chosen.glyph, color: chosen.color };
  }
  if (owner.kind === "section") {
    return { name: "section", glyph: state?.defaults.section, color: null };
  }
  const personal = owner.id === state?.personalProjectId;
  return {
    name: personal ? "bubble-chat" : "folder-01",
    glyph: personal ? state?.defaults.personal : state?.defaults.project,
    color: null,
  };
}
