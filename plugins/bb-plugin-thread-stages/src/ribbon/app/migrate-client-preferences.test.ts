import { describe, expect, it } from "vitest";
import { ribbonClientPreferences } from "./migrate-client-preferences";

function storage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("Ribbon client preferences", () => {
  it("carries the grouping and every fold over as bb's list preferences, once", () => {
    const store = storage({
      "bb.plugin.ribbon-sidebar.preferences.v1": JSON.stringify({
        view: { scope: { kind: "all" }, groupingKey: "builtin:projects" },
        collapsed: [
          "builtin:pinned",
          "builtin:sections/sec_a",
          "builtin:sections/unsectioned",
          "builtin:projects/proj_b",
          "plugin:thread-stages:stages/Completed",
        ],
      }),
      "bb.plugin.ribbon-sidebar.collapsedThreads": JSON.stringify(["thr_parent", 3]),
    });
    expect(ribbonClientPreferences(store)).toEqual({
      organizationMode: "project",
      collapsedThreadSections: ["chronological::sec_a"],
      collapsedProjects: ["proj_b"],
      collapsedSections: ["pinned", "threads"],
      collapsedThreads: ["thr_parent"],
    });
    expect(ribbonClientPreferences(store)).toBeNull();
  });

  it("carries nothing from a client that never ran Ribbon", () => {
    expect(ribbonClientPreferences(storage({}))).toBeNull();
  });
});
