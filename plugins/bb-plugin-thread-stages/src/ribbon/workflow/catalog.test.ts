import { describe, expect, it } from "vitest";
import CheckIcon from "@hugeicons/core-free-icons/CheckIcon";
import PauseIcon from "@hugeicons/core-free-icons/PauseIcon";
import HourglassIcon from "@hugeicons/core-free-icons/HourglassIcon";
import UserMultiple02Icon from "@hugeicons/core-free-icons/UserMultiple02Icon";
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

  it("serializes the original Hugeicons without fitting or changing their strokes", () => {
    for (const [stage, glyph] of [
      ["Deferred", PauseIcon],
      ["BlockedOnOtherAgent", HourglassIcon],
      ["BlockedOnThirdParty", UserMultiple02Icon],
      ["Completed", CheckIcon],
    ] as const) {
      expect(STAGE_ICONS[stage]).toEqual({
        tag: "svg",
        attrs: { viewBox: "0 0 24 24", fill: "none" },
        children: glyph.map(([tag, { key: _key, ...attrs }]) => ({ tag, attrs })),
      });
    }
  });

  it("hides all dependency stages behind one legacy setting", () => {
    const [grouping] = createGroupingCatalog({ showBlockedStage: false }).groupings;
    expect(grouping!.groups.filter(({ acceptsAssignments }) => !acceptsAssignments).map(({ id }) => id))
      .toEqual(["BlockedOnUser", "BlockedOnOtherAgent", "BlockedOnThirdParty"]);
  });
});
