import { makeSidebarThread } from "../../app/model/fixtures.js";
import { describe, expect, it } from "vitest";
import { createRibbonComparator, placementGroupingKey, placementRanks } from "./order";

const thread = (id: string, createdAt: number, parentThreadId: string | null = null) =>
  makeSidebarThread({ id, createdAt, parentThreadId });

describe("Ribbon order", () => {
  it("ranks roots by their placement and puts unranked roots first, newest first", () => {
    const ranks = placementRanks([
      { groupingKey: "builtin:sections", groupId: "s", threadId: "b", enteredAtMs: null },
      { groupingKey: "builtin:sections", groupId: "s", threadId: "a", enteredAtMs: null },
    ]);
    const compare = createRibbonComparator(ranks, []);
    const roots = [thread("a", 1), thread("new-old", 5), thread("b", 2), thread("new", 9)];
    expect([...roots].sort(compare).map(({ id }) => id)).toEqual(["new", "new-old", "b", "a"]);
  });

  it("orders children by their saved sibling rank, ignoring a rank under a former parent", () => {
    const compare = createRibbonComparator(new Map(), [
      { parentThreadId: "p", threadId: "second" },
      { parentThreadId: "p", threadId: "first" },
      { parentThreadId: "other", threadId: "moved" },
    ]);
    const children = [thread("first", 1, "p"), thread("moved", 3, "p"), thread("second", 2, "p"), thread("fresh", 4, "p")];
    expect([...children].sort(compare).map(({ id }) => id)).toEqual(["fresh", "moved", "second", "first"]);
  });

  it("ranks a root whose parent is gone by its placement, not by a child rank", () => {
    const compare = createRibbonComparator(placementRanks([
      { groupingKey: "builtin:sections", groupId: "s", threadId: "orphan", enteredAtMs: null },
      { groupingKey: "builtin:sections", groupId: "s", threadId: "root", enteredAtMs: null },
    ]), [{ parentThreadId: "dead", threadId: "orphan" }]);
    expect([thread("root", 1), thread("orphan", 2, "dead")].sort(compare).map(({ id }) => id)).toEqual(["orphan", "root"]);
  });

  it("names the placement grouping each organization orders by", () => {
    expect(placementGroupingKey("chronological")).toBe("builtin:sections");
    expect(placementGroupingKey("project")).toBe("builtin:projects");
    expect(placementGroupingKey("machine")).toBe("builtin:machines");
  });
});
