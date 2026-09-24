import { describe, expect, it } from "vitest";
import { sectionBands } from "./section-layout";

describe("section layout", () => {
  it("keeps working stages interleaved in retained rank and sorts completions by time", () => {
    const rows = [
      { id: "blocked", stage: "Blocked", completedAt: 0 },
      { id: "older", stage: "Completed", completedAt: 20 },
      { id: "idle", stage: "Idle", completedAt: 0 },
      { id: "later", stage: "Deferred", completedAt: 0 },
      { id: "active", stage: "Active", completedAt: 0 },
      { id: "newer", stage: "Completed", completedAt: 30 },
    ];
    const bands = sectionBands(
      rows,
      (row) => row.stage,
      (row) => row.completedAt,
    );
    expect(bands.main.map((row) => row.id)).toEqual([
      "blocked",
      "idle",
      "active",
    ]);
    expect(bands.deferred.map((row) => row.id)).toEqual(["later"]);
    expect(bands.completed.map((row) => row.id)).toEqual(["newer", "older"]);
  });
});
