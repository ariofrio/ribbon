import { describe, expect, it } from "vitest";
import { STAGE_ICONS, createGroupingCatalog } from "./catalog";
import { WORKFLOW_STAGES } from "./workflow-stage";

describe("stage catalog", () => {
  it("places newly entering threads at the start of every stage", () => {
    const [grouping] = createGroupingCatalog({}).groupings;
    expect(grouping!.groups.map(({ defaultPlacement }) => defaultPlacement))
      .toEqual(WORKFLOW_STAGES.map(() => "start"));
  });

  it("offers six stages with distinct dependency owners", () => {
    const [grouping] = createGroupingCatalog({}).groupings;
    expect(grouping!.defaultGroupId).toBe("Active");
    expect(grouping!.groups.map(({ id, label }) => [id, label])).toEqual([
      ["Deferred", "Deferred"],
      ["Active", "In progress"],
      ["BlockedOnUser", "Needs user"],
      ["BlockedOnOtherAgent", "Dependent"],
      ["BlockedOnThirdParty", "Blocked"],
      ["Completed", "Completed"],
    ]);
  });

  it("preserves main's Deferred ring", () => {
    const ring = STAGE_ICONS.Deferred.children![0]!;
    expect(ring.attrs.strokeWidth).toBe(2);
    expect(((Number(ring.attrs.r) + Number(ring.attrs.strokeWidth) / 2) * 2 * 16) / 24).toBe(13);
    expect(ring.attrs.strokeDasharray).toBeDefined();
  });

  it("hides all dependency stages behind one legacy setting", () => {
    const [grouping] = createGroupingCatalog({ showBlockedStage: false }).groupings;
    expect(grouping!.groups.filter(({ acceptsAssignments }) => !acceptsAssignments).map(({ id }) => id))
      .toEqual(["BlockedOnUser", "BlockedOnOtherAgent", "BlockedOnThirdParty"]);
  });
});
