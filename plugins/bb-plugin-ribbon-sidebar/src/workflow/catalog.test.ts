import { describe, expect, it } from "vitest";
import {
  STAGE_ICONS,
  WORKING_STAGE_ICONS,
  createGroupingCatalog,
} from "./catalog";
import { WORKFLOW_STAGES } from "./workflow-stage";

describe("sidebar stage icons", () => {
  it("renders every stage ring 13 pixels across with a larger inner radius", () => {
    for (const stage of WORKFLOW_STAGES) {
      const ring = STAGE_ICONS[stage].children![0]!;
      expect(ring.attrs.strokeWidth).toBe(2);
      expect(Number(ring.attrs.r) - Number(ring.attrs.strokeWidth) / 2).toBe(7.75);
      expect(
        ((Number(ring.attrs.r) + Number(ring.attrs.strokeWidth) / 2) * 2 * 16) /
          24,
      ).toBe(13);

      const workingRing = WORKING_STAGE_ICONS[stage].ring.children![0]!;
      expect(workingRing.attrs.strokeWidth).toBe(2);
      if (workingRing.tag === "circle") {
        expect(
          Number(workingRing.attrs.r) - Number(workingRing.attrs.strokeWidth) / 2,
        ).toBe(7.75);
      } else {
        expect(workingRing.attrs.d).toContain("M20.75 12a8.75 8.75");
      }
    }
  });
});

describe("stage catalog", () => {
  it("labels the stages and marks the two Blocked stages apart", () => {
    const [grouping] = createGroupingCatalog({}).groupings;
    expect(grouping!.defaultGroupId).toBe("Active");
    expect(grouping!.groups.map(({ id, label }) => [id, label])).toEqual([
      ["Deferred", "Deferred"],
      ["Active", "Active"],
      ["BlockedOnOtherAgent", "Blocked on other agent"],
      ["BlockedOnThirdParty", "Blocked on third party"],
      ["Completed", "Completed"],
    ]);
    // A slash for another agent runs exactly along the third party's arrow.
    const marks = (stage: (typeof WORKFLOW_STAGES)[number]) =>
      STAGE_ICONS[stage].children!.slice(1);
    expect(marks("Active")).toEqual([]);
    expect(marks("BlockedOnOtherAgent")).toEqual([
      expect.objectContaining({
        tag: "path",
        attrs: expect.objectContaining({ d: "M9 15 15.5 8.5" }),
      }),
    ]);
    expect(marks("BlockedOnThirdParty")).toEqual([
      expect.objectContaining({
        tag: "path",
        attrs: expect.objectContaining({ d: "M15.5 8.5 9 15M9 10.25V15h4.75" }),
      }),
    ]);
  });

  it("hides both Blocked stages behind one setting", () => {
    const [grouping] = createGroupingCatalog({ showBlockedStage: false })
      .groupings;
    expect(
      grouping!.groups
        .filter(({ acceptsAssignments }) => !acceptsAssignments)
        .map(({ id }) => id),
    ).toEqual(["BlockedOnOtherAgent", "BlockedOnThirdParty"]);
  });
});
