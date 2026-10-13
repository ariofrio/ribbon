import { makeSidebarThread } from "../../app/model/fixtures.js";
import { describe, expect, it } from "vitest";
import type { ProjectThreadItem } from "../../app/model/project-thread-groups.js";
import { bandOf, itemThread, stageBands } from "./bands";

const item = (id: string): ProjectThreadItem => ({
  kind: "thread",
  node: {
    thread: makeSidebarThread({ id }),
    children: [],
    depth: 0,
    stats: { childCount: 0, childActivity: {} as never },
  },
});

describe("stage bands", () => {
  it("partitions every band in the containing group order", () => {
    const stages = new Map([
      ["a", "Active"],
      ["b", "Completed"],
      ["c", "BlockedOnThirdParty"],
      ["d", "Deferred"],
      ["e", "Completed"],
      ["f", "Deferred"],
    ] as const);
    const bands = stageBands(
      ["a", "b", "c", "d", "e", "f"].map(item),
      (id) => stages.get(id as never),
    );
    const ids = (items: ProjectThreadItem[]) => items.map((each) => itemThread(each)?.id);
    expect(ids(bands.main)).toEqual(["a", "c"]);
    expect(ids(bands.deferred)).toEqual(["d", "f"]);
    expect(ids(bands.completed)).toEqual(["b", "e"]);
  });

  it("treats a thread without a stage as Idle", () => {
    expect(bandOf(undefined)).toBe("main");
    expect(bandOf("BlockedOnThirdParty")).toBe("main");
    expect(bandOf("Waiting")).toBe("main");
  });

  it("keeps automatic sorting within every stage band", () => {
    const stages = new Map([
      ["a", "Completed"], ["b", "Deferred"], ["c", "Active"],
      ["d", "Completed"], ["e", "Deferred"], ["f", "BlockedOnOtherAgent"],
    ] as const);
    const bands = stageBands(["a", "b", "c", "d", "e", "f"].map(item), (id) => stages.get(id as never));
    const ids = (items: ProjectThreadItem[]) => items.map((each) => itemThread(each)?.id);
    expect(ids(bands.main)).toEqual(["c", "f"]);
    expect(ids(bands.deferred)).toEqual(["b", "e"]);
    expect(ids(bands.completed)).toEqual(["a", "d"]);
  });

  it("keeps an environment with mixed stages in the main band", () => {
    const nodes = [item("done"), item("active")].map((item) => {
      if (item.kind !== "thread") throw new Error("Expected a thread");
      return item.node;
    });
    const environment: ProjectThreadItem = {
      kind: "environment",
      group: {
        environmentId: "env_mixed",
        environmentProviderId: null,
        nodes: [nodes[0], nodes[1]],
        stats: nodes[0].stats,
      },
    };
    expect(stageBands([environment], (id) => id === "done" ? "Completed" : "Active").main)
      .toEqual([environment]);
    expect(stageBands([environment], () => "Completed").completed).toEqual([environment]);
  });
});
