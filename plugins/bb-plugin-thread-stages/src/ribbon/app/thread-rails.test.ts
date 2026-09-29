import { describe, expect, it } from "vitest";
import { railSegments, treeLines } from "./thread-rails";

describe("child thread rails", () => {
  it("draws nothing beside a root thread", () => {
    expect(
      railSegments({ depth: 0, firstChild: false, endsGroup: [], ring: "shown" }),
    ).toEqual([]);
  });

  it("threads a middle child's shown ring onto its bar", () => {
    expect(
      railSegments({
        depth: 1,
        firstChild: false,
        endsGroup: [false],
        ring: "shown",
      }),
    ).toEqual([
      { level: 1, from: "row-top", to: "ring-top" },
      { level: 1, from: "ring-bottom", to: "row-bottom" },
    ]);
  });

  it("runs the bar through a hidden ring's slot until the ring shows", () => {
    expect(
      railSegments({
        depth: 1,
        firstChild: false,
        endsGroup: [false],
        ring: "hidden-at-rest",
      }),
    ).toEqual([
      { level: 1, from: "row-top", to: "ring-top" },
      { level: 1, from: "ring-top", to: "ring-bottom", whileRingHidden: true },
      { level: 1, from: "ring-bottom", to: "row-bottom" },
    ]);
  });

  it("starts the bar at the first child's ring and ends it at the last", () => {
    expect(
      railSegments({
        depth: 1,
        firstChild: true,
        endsGroup: [true],
        ring: "hidden-at-rest",
      }),
    ).toEqual([
      { level: 1, from: "ring-top", to: "ring-bottom", whileRingHidden: true },
    ]);
    expect(
      railSegments({
        depth: 1,
        firstChild: true,
        endsGroup: [true],
        ring: "shown",
      }),
    ).toEqual([]);
  });

  it("carries each enclosing group's bar past a nested row", () => {
    expect(
      railSegments({
        depth: 2,
        firstChild: true,
        endsGroup: [false, true],
        ring: "absent",
      }),
    ).toEqual([
      { level: 1, from: "row-top", to: "row-bottom" },
      { level: 2, from: "ring-top", to: "ring-bottom" },
    ]);
  });

  it("ends an enclosing group's bar level with the ring slot of its last row", () => {
    expect(
      railSegments({
        depth: 2,
        firstChild: false,
        endsGroup: [true, true],
        ring: "shown",
      }),
    ).toEqual([
      { level: 1, from: "row-top", to: "ring-bottom" },
      { level: 2, from: "row-top", to: "ring-top" },
    ]);
  });
});

describe("child thread tree", () => {
  // Coordinates are pixels across the row and down from the stage ring's
  // centre. Rings sit at x = 16, 40, 64… by depth, and each 1px line is drawn
  // half a pixel right of and below the column and centre line it follows.
  it("draws nothing beside a root thread without children", () => {
    expect(
      treeLines({ depth: 0, lastAtDepth: [], showsChildren: false, ring: "hidden-at-rest" }),
    ).toEqual({ always: "", whileRingHidden: "", node: null });
  });

  it("drops a parent's line from the bottom of its shown ring", () => {
    expect(
      treeLines({ depth: 0, lastAtDepth: [], showsChildren: true, ring: "shown" }),
    ).toEqual({ always: "M16.5 6.5V10000", whileRingHidden: "", node: null });
  });

  it("hangs a parent's line from a small hollow node while its ring is hidden", () => {
    expect(
      treeLines({ depth: 0, lastAtDepth: [], showsChildren: true, ring: "hidden-at-rest" }),
    ).toEqual({
      always: "M16.5 6.5V10000",
      whileRingHidden: "M16.5 3V6.5",
      node: { cx: 16.5, cy: 0.5 },
    });
  });

  it("branches a middle child off its parent's line to its shown ring", () => {
    expect(
      treeLines({ depth: 1, lastAtDepth: [false], showsChildren: false, ring: "shown" }),
    ).toEqual({
      always: "M16.5 -10000V10000M16.5 -5.5Q16.5 0.5 22.5 0.5H33.5",
      whileRingHidden: "",
      node: null,
    });
  });

  it("ends the last child's branch at a small hollow node while its ring is hidden", () => {
    expect(
      treeLines({ depth: 1, lastAtDepth: [true], showsChildren: false, ring: "hidden-at-rest" }),
    ).toEqual({
      always: "M16.5 -10000V-5.5Q16.5 0.5 22.5 0.5H33.5",
      whileRingHidden: "M33.5 0.5H38",
      node: { cx: 40.5, cy: 0.5 },
    });
  });

  it("carries an ancestor's line past a nested row only while it has later siblings", () => {
    expect(
      treeLines({ depth: 2, lastAtDepth: [false, true], showsChildren: false, ring: "shown" }).always,
    ).toBe("M16.5 -10000V10000M40.5 -10000V-5.5Q40.5 0.5 46.5 0.5H57.5");
    expect(
      treeLines({ depth: 2, lastAtDepth: [true, true], showsChildren: false, ring: "shown" }).always,
    ).toBe("M40.5 -10000V-5.5Q40.5 0.5 46.5 0.5H57.5");
  });

  it("draws a node with no ring to reveal as part of the tree", () => {
    expect(
      treeLines({ depth: 1, lastAtDepth: [true], showsChildren: true, ring: "absent" }),
    ).toEqual({
      always: "M16.5 -10000V-5.5Q16.5 0.5 22.5 0.5H33.5M40.5 6.5V10000M33.5 0.5H38M40.5 3V6.5",
      whileRingHidden: "",
      node: { cx: 40.5, cy: 0.5 },
    });
  });
});
