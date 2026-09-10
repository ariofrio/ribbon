import type { PluginRpcClient } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import type { IconSvgElement } from "@hugeicons/react";
import type { ProjectSummary } from "./project-lookup";
import type {
  IconColor,
  IconOwner,
  PlacementSetting,
  StoredIcon,
} from "./store";

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

/** Keep the last drawing when an SDK RPC call fails. */
export function iconsRpc(rpc: PluginRpcClient<typeof rpcContract>) {
  return {
    list: () => rpc.call("listIcons", null).catch(() => null),
    listCatalog: () => rpc.call("listIconCatalog", null).catch(() => null),
    set: (icon: IconOwner & { icon: string; color: IconColor | null }) =>
      rpc.call("setIcon", icon).catch(() => null),
    clear: (owner: IconOwner) => rpc.call("clearIcon", owner).catch(() => null),
  };
}

export type IconsRpc = ReturnType<typeof iconsRpc>;

/** Looks up one owner's drawing, falling back to the kind's default. */
export function iconFor(
  state: IconsState | null,
  owner: IconOwner,
  personalProjectId: string,
): {
  name: string;
  glyph: IconSvgElement | undefined;
  color: IconColor | null;
} {
  const chosen = state?.icons.find(
    (item) => item.kind === owner.kind && item.id === owner.id,
  );
  if (chosen !== undefined) {
    return { name: chosen.icon, glyph: chosen.glyph, color: chosen.color };
  }
  if (owner.kind === "section") {
    return { name: "section", glyph: state?.defaults.section, color: null };
  }
  const personal = owner.id === personalProjectId;
  return {
    name: personal ? "bubble-chat" : "folder-01",
    glyph: personal ? state?.defaults.personal : state?.defaults.project,
    color: null,
  };
}
