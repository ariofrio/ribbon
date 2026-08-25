// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  ICONS_CHANNEL,
  buildProjectIconMap,
  fetchIcons,
  type IconsResponse,
  subscribeToProjectIconChanges,
} from "./icons";

const folder = [["path", { d: "M1" }]] as const;
const bubble = [["path", { d: "M2" }]] as const;
const rocket = [["path", { d: "M3" }]] as const;

const section = [["path", { d: "M4" }]] as const;

const response: IconsResponse = {
  icons: [
    { kind: "project", id: "proj_a", icon: "rocket", color: "teal", glyph: rocket },
    { kind: "project", id: "proj_b", icon: "coffee-01", color: null, glyph: rocket },
  ],
  defaults: { project: folder, personal: bubble, section },
};

describe("buildProjectIconMap", () => {
  it("falls back to the folder, and to the bubble for the personal project", () => {
    const map = buildProjectIconMap(response, ["proj_c", "proj_mine"], "proj_mine");

    expect(map.get("proj_c")).toEqual({
      name: "folder-01",
      glyph: folder,
      color: null,
    });
    expect(map.get("proj_mine")).toEqual({
      name: "bubble-chat",
      glyph: bubble,
      color: null,
    });
  });

  it("gives a chosen color its own lightness per mode", () => {
    const map = buildProjectIconMap(response, ["proj_a", "proj_b"], null);

    expect(map.get("proj_a")).toEqual({
      name: "rocket",
      glyph: rocket,
      color: "light-dark(oklch(0.556 0.086 191.6), oklch(0.793 0.136 191.6))",
    });
    expect(map.get("proj_b")?.color).toBeNull();
  });

  it("ignores a color name it does not know", () => {
    const map = buildProjectIconMap(
      {
        ...response,
        icons: [
          { kind: "project", id: "proj_a", icon: "rocket", color: "chartreuse", glyph: rocket },
        ],
      },
      ["proj_a"],
      null,
    );

    expect(map.get("proj_a")?.color).toBeNull();
  });
});

describe("fetchIcons", () => {
  it("draws what the Icons plugin answers", async () => {
    const icons = await fetchIcons(async () => response, ["proj_a"], null);

    expect(icons.projects.get("proj_a")?.name).toBe("rocket");
  });

  it("leaves the sidebar iconless when that plugin is not there", async () => {
    const icons = await fetchIcons(
      async () => {
        throw new Error("plugin not installed");
      },
      ["proj_a"],
      null,
    );

    expect(icons.projects.size).toBe(0);
    expect(icons.sections.size).toBe(0);
  });
});

describe("subscribeToProjectIconChanges", () => {
  it("wakes on an announcement from the Icons plugin", async () => {
    const seen = vi.fn();
    const stop = subscribeToProjectIconChanges(seen);
    const announcer = new BroadcastChannel(ICONS_CHANNEL);

    announcer.postMessage({ type: "icons-changed" });
    await vi.waitFor(() => expect(seen).toHaveBeenCalled());

    stop();
    announcer.postMessage({ type: "icons-changed" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toHaveBeenCalledTimes(1);
    announcer.close();
  });

  it("names the channel the other plugin broadcasts on", () => {
    expect(ICONS_CHANNEL).toBe("bb.icons");
  });
});

describe("section icons", () => {
  it("leaves a project row alone when a section shares its id", () => {
    const map = buildProjectIconMap(
      {
        ...response,
        icons: [
          {
            kind: "section",
            id: "proj_a",
            icon: "rocket",
            color: "teal",
            glyph: rocket,
          },
        ],
      },
      ["proj_a"],
      null,
    );

    // These rows are projects; the Icons plugin stores both kinds in one list.
    expect(map.get("proj_a")).toEqual({
      name: "folder-01",
      glyph: folder,
      color: null,
    });
  });
});
