import { describe, expect, it } from "vitest";
import {
  liveChildren,
  liveParentId,
  moveChild,
  orderChildren,
  stepChild,
} from "./child-order";

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

describe("liveChildren and liveParentId", () => {
  const live = (
    id: string,
    parentThreadId: string | null,
    createdAt: number,
    overrides: { visibility?: "visible" | "hidden"; archivedAt?: number } = {},
  ) => ({
    id,
    parentThreadId,
    createdAt,
    visibility: overrides.visibility ?? ("visible" as const),
    archivedAt: overrides.archivedAt ?? null,
  });
  const threads = [
    live("root", null, 0),
    live("a", "root", 1),
    live("b", "root", 2),
    live("hidden", "root", 3, { visibility: "hidden" }),
    live("archived", "root", 4, { archivedAt: 5 }),
    live("orphan", "archived", 6),
  ];

  it("lists a parent's live children in sidebar order", () => {
    expect(liveChildren(threads, [], "root").map(({ id }) => id)).toEqual([
      "b",
      "a",
    ]);
    expect(
      liveChildren(
        threads,
        [
          { parentThreadId: "root", threadId: "a" },
          { parentThreadId: "root", threadId: "b" },
        ],
        "root",
      ).map(({ id }) => id),
    ).toEqual(["a", "b"]);
  });

  it("names the parent only of a thread nested under a live parent", () => {
    expect(liveParentId(threads, "a")).toBe("root");
    expect(liveParentId(threads, "root")).toBeNull();
    expect(liveParentId(threads, "orphan")).toBeNull();
    expect(liveParentId(threads, "hidden")).toBeNull();
  });
});

describe("stepChild", () => {
  it("moves one step or to the edge among siblings", () => {
    const siblings = ["a", "b", "c"];
    expect(stepChild(siblings, "b", "step", -1)).toEqual(["b", "a", "c"]);
    expect(stepChild(siblings, "b", "step", 1)).toEqual(["a", "c", "b"]);
    expect(stepChild(siblings, "c", "edge", -1)).toEqual(["c", "a", "b"]);
    expect(stepChild(siblings, "a", "edge", 1)).toEqual(["b", "c", "a"]);
    expect(stepChild(siblings, "a", "step", -1)).toBeNull();
    expect(stepChild(siblings, "c", "edge", 1)).toBeNull();
  });
});
