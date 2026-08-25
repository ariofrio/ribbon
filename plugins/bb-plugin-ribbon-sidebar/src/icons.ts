import type { IconSvgElement } from "@hugeicons/react";

export const ICONS_CHANNEL = "bb.icons";

export interface EntityIconView {
  glyph: IconSvgElement;
  color: string | null;
}

export interface IconsResponse {
  icons: Array<{
    kind: "project" | "section";
    id: string;
    icon: string;
    color: string | null;
    glyph: IconSvgElement;
  }>;
  defaults: {
    project: IconSvgElement;
    personal: IconSvgElement;
    section: IconSvgElement;
  };
}

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

export function buildSectionIconMap(
  response: IconsResponse,
): Map<string, EntityIconView> {
  const icons = new Map<string, EntityIconView>();
  for (const icon of response.icons) {
    if (icon.kind !== "section") continue;
    icons.set(icon.id, {
      glyph: icon.glyph,
      color: iconColor(icon.color),
    });
  }
  return icons;
}

export async function fetchSectionIcons(
  loadIcons: () => Promise<IconsResponse>,
): Promise<Map<string, EntityIconView>> {
  try {
    return buildSectionIconMap(await loadIcons());
  } catch {
    return new Map();
  }
}

export function subscribeToIconChanges(onChange: () => void): () => void {
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
