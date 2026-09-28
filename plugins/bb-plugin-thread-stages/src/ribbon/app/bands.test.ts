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
  it("keeps the main list in retained order and sorts Completed by completion time", () => {
    const stages = new Map([
      ["a", "Active"],
      ["b", "Completed"],
      ["c", "BlockedOnThirdParty"],
      ["d", "Deferred"],
      ["e", "Completed"],
    ] as const);
    const completedAt = new Map([["b", 10], ["e", 20]]);
    const bands = stageBands(
      ["a", "b", "c", "d", "e"].map(item),
      (id) => stages.get(id as never),
      (id) => completedAt.get(id) ?? 0,
    );
    const ids = (items: ProjectThreadItem[]) => items.map((each) => itemThread(each)?.id);
    expect(ids(bands.main)).toEqual(["a", "c"]);
    expect(ids(bands.deferred)).toEqual(["d"]);
    expect(ids(bands.completed)).toEqual(["e", "b"]);
  });

  it("treats a thread without a stage as Idle", () => {
    expect(bandOf(undefined)).toBe("main");
    expect(bandOf("BlockedOnThirdParty")).toBe("main");
  });
});
