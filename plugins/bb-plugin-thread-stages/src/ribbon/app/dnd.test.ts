import { describe, expect, it } from "vitest";
import { sameReorderableBand } from "./dnd";

describe("drag reorder bands", () => {
  it("lets Active and Blocked trade places and reorders Deferred and Completed within their own bands", () => {
    expect(sameReorderableBand("Active", "BlockedOnThirdParty")).toBe(true);
    expect(sameReorderableBand("BlockedOnThirdParty", "Active")).toBe(true);
    expect(sameReorderableBand("Deferred", "Deferred")).toBe(true);
    expect(sameReorderableBand("Active", "Deferred")).toBe(false);
    expect(sameReorderableBand("Completed", "Completed")).toBe(true);
    expect(sameReorderableBand("Active", "Completed")).toBe(false);
  });
});
