import { describe, expect, it } from "vitest";
import { sameReorderableBand } from "./dnd";

describe("drag reorder bands", () => {
  it("lets Idle and Blocked trade places, keeps Deferred to itself, and never reorders Completed", () => {
    expect(sameReorderableBand("Active", "BlockedOnThirdParty")).toBe(true);
    expect(sameReorderableBand("BlockedOnThirdParty", "Active")).toBe(true);
    expect(sameReorderableBand("Deferred", "Deferred")).toBe(true);
    expect(sameReorderableBand("Active", "Deferred")).toBe(false);
    expect(sameReorderableBand("Completed", "Completed")).toBe(false);
    expect(sameReorderableBand("Active", "Completed")).toBe(false);
  });
});
