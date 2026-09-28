import { describe, expect, it } from "vitest";
import { moveChild, orderChildren } from "./child-order";

const child = (id: string, createdAt: number) => ({
  id,
  parentThreadId: "parent",
  createdAt,
});

describe("orderChildren", () => {
  it("puts the newest unranked children first, then the ranked order", () => {
    const children = [
      child("ranked-b", 1),
      child("new-old", 5),
      child("ranked-a", 2),
      child("new-young", 9),
    ];
    const ranks = [
      { parentThreadId: "parent", threadId: "ranked-a" },
      { parentThreadId: "parent", threadId: "ranked-b" },
    ];

    expect(orderChildren(children, ranks).map(({ id }) => id)).toEqual([
      "new-young",
      "new-old",
      "ranked-a",
      "ranked-b",
    ]);
  });

  it("ignores a rank saved under a former parent", () => {
    const children = [child("moved", 1), child("stays", 2)];
    const ranks = [
      { parentThreadId: "former-parent", threadId: "moved" },
      { parentThreadId: "parent", threadId: "stays" },
    ];

    expect(orderChildren(children, ranks).map(({ id }) => id)).toEqual([
      "moved",
      "stays",
    ]);
  });
});

describe("moveChild", () => {
  it("places the child before its anchor, or last without one", () => {
    const siblings = ["a", "b", "c", "d"];

    expect(moveChild(siblings, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveChild(siblings, "a", null)).toEqual(["b", "c", "d", "a"]);
    expect(moveChild(siblings, "c", "a")).toEqual(["c", "a", "b", "d"]);
  });

  it("returns null when the child or anchor is not a sibling", () => {
    expect(moveChild(["a", "b"], "x", null)).toBeNull();
    expect(moveChild(["a", "b"], "a", "x")).toBeNull();
    expect(moveChild(["a", "b"], "a", "a")).toBeNull();
  });
});
