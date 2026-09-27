import { describe, expect, it } from "vitest";
import { STAGE_ICONS, WORKING_STAGE_ICONS } from "./catalog";
import { WORKFLOW_STAGES } from "./workflow-stage";

describe("sidebar stage icons", () => {
  it("thickens every outer ring without moving its inner edge", () => {
    for (const stage of WORKFLOW_STAGES) {
      const ring = STAGE_ICONS[stage].children![0]!;
      expect(ring.attrs.strokeWidth).toBe(2);
      expect(Number(ring.attrs.r) - Number(ring.attrs.strokeWidth) / 2).toBe(
        7.25,
      );

      const workingRing = WORKING_STAGE_ICONS[stage].ring.children![0]!;
      expect(workingRing.attrs.strokeWidth).toBe(2);
      if (workingRing.tag === "circle") {
        expect(
          Number(workingRing.attrs.r) - Number(workingRing.attrs.strokeWidth) / 2,
        ).toBe(7.25);
      } else {
        expect(workingRing.attrs.d).toContain("a8.25 8.25");
      }
    }
  });
});
