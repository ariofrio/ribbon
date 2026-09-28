import { describe, expect, it } from "vitest";
import { STAGE_ICONS, WORKING_STAGE_ICONS } from "./catalog";
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
