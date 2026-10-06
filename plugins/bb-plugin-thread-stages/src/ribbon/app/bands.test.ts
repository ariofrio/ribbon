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
  it("keeps the main list in retained order and Deferred and Completed in their saved orders", () => {
    const stages = new Map([
      ["a", "Active"],
      ["b", "Completed"],
      ["c", "BlockedOnThirdParty"],
      ["d", "Deferred"],
      ["e", "Completed"],
      ["f", "Deferred"],
    ] as const);
    const stageRank = new Map([["e", 0], ["b", 1], ["f", 2], ["d", 3]]);
    const bands = stageBands(
      ["a", "b", "c", "d", "e", "f"].map(item),
      (id) => stages.get(id as never),
      (id) => stageRank.get(id) ?? Infinity,
    );
    const ids = (items: ProjectThreadItem[]) => items.map((each) => itemThread(each)?.id);
    expect(ids(bands.main)).toEqual(["a", "c"]);
    expect(ids(bands.deferred)).toEqual(["f", "d"]);
    expect(ids(bands.completed)).toEqual(["e", "b"]);
  });

  it("treats a thread without a stage as Idle", () => {
    expect(bandOf(undefined)).toBe("main");
    expect(bandOf("BlockedOnThirdParty")).toBe("main");
  });
});
