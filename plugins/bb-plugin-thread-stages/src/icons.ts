import type { IconSvgElement } from "@hugeicons/react";

/**
 * The Icons plugin announces edits here. A plugin cannot join another
 * plugin's realtime channel, and both run in the same document, so a broadcast
 * channel carries the change: instantly within a window, and to other windows
 * of the same client too.
 */
export const ICONS_CHANNEL = "bb.icons";

export interface ProjectIconView {
  name: string;
  glyph: IconSvgElement;
  /** Null means the icon inherits the row's text color. */
  color: string | null;
}

interface StoredIcon {
  kind: "project" | "section";
  id: string;
  icon: string;
  color: string | null;
  glyph: IconSvgElement;
}

export interface IconsResponse {
  icons: StoredIcon[];
  defaults: {
    project: IconSvgElement;
    personal: IconSvgElement;
    section: IconSvgElement;
  };
}

/**
 * Mirrors the palette the Icons plugin defines, so a color reads the
 * same on a row as it does in the header. Each color holds one hue and picks
 * its lightness per mode; see that plugin's project-icon-colors.ts for how the
 * anchors were fitted across bb's themes.
 */
const ANCHORS: Record<string, { light: string; dark: string }> = {
  red: { light: "0.531 0.212 23.5", dark: "0.8 0.103 23.5" },
  orange: { light: "0.595 0.151 52.9", dark: "0.72 0.179 52.9" },
  yellow: { light: "0.52 0.107 95", dark: "0.8 0.159 95" },
  green: { light: "0.56 0.171 140", dark: "0.729 0.235 140" },
  teal: { light: "0.556 0.086 191.6", dark: "0.793 0.136 191.6" },
  blue: { light: "0.522 0.175 256", dark: "0.72 0.148 256" },
  purple: { light: "0.6 0.279 306", dark: "0.8 0.128 306" },
  pink: { light: "0.52 0.207 345.5", dark: "0.72 0.21 345.5" },
};

function iconColor(color: string | null): string | null {
  if (color === null) return null;
  const anchor = ANCHORS[color];
  return anchor === undefined
    ? null
    : `light-dark(oklch(${anchor.light}), oklch(${anchor.dark}))`;
}

export function buildProjectIconMap(
  response: IconsResponse,
  projectIds: readonly string[],
  personalProjectId: string | null,
): Map<string, ProjectIconView> {
  const byProject = new Map<string, ProjectIconView>();
  for (const projectId of projectIds) {
    const personal = projectId === personalProjectId;
    byProject.set(projectId, {
      name: personal ? "bubble-chat" : "folder-01",
      glyph: personal ? response.defaults.personal : response.defaults.project,
      color: null,
    });
  }
  for (const icon of response.icons) {
    // The plugin also stores section icons; this sidebar draws project rows.
    if (icon.kind !== "project") continue;
    byProject.set(icon.id, {
      name: icon.icon,
      glyph: icon.glyph,
      color: iconColor(icon.color),
    });
  }
  return byProject;
}

/**
 * Icons come from the Icons plugin, which bb calls on this plugin's behalf.
 * Never throws: without that plugin the sidebar draws no icons.
 */
export async function fetchProjectIcons(
  loadIcons: () => Promise<IconsResponse>,
  projectIds: readonly string[],
  personalProjectId: string | null,
): Promise<Map<string, ProjectIconView>> {
  try {
    return buildProjectIconMap(await loadIcons(), projectIds, personalProjectId);
  } catch {
    return new Map();
  }
}

/** Calls back whenever the Icons plugin reports an edit. */
export function subscribeToProjectIconChanges(onChange: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(ICONS_CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    // Older clients without BroadcastChannel still refresh on focus.
  }
  window.addEventListener("focus", onChange);
  return () => {
    channel?.close();
    window.removeEventListener("focus", onChange);
  };
}
