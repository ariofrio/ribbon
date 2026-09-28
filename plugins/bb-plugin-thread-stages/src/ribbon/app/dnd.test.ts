import { describe, expect, it } from "vitest";
import { sameReorderableBand } from "./dnd";

describe("drag reorder bands", () => {
  it("lets Idle and Blocked trade places, keeps Deferred to itself, and never reorders Completed", () => {
    expect(sameReorderableBand("Idle", "Blocked")).toBe(true);
    expect(sameReorderableBand("Blocked", "Idle")).toBe(true);
    expect(sameReorderableBand("Deferred", "Deferred")).toBe(true);
    expect(sameReorderableBand("Idle", "Deferred")).toBe(false);
    expect(sameReorderableBand("Completed", "Completed")).toBe(false);
    expect(sameReorderableBand("Idle", "Completed")).toBe(false);
  });
});
