import { describe, expect, it } from "vitest";
import { railSegments } from "./thread-rails";

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
