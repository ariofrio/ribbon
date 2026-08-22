import { describe, expect, it } from "vitest";
import { projectLookup } from "./project-lookup";

describe("projectLookup", () => {
  it("resolves the name bb drew back to the project it belongs to", () => {
    const lookup = projectLookup([
      { id: "proj_a", name: "Storefront" },
      { id: "proj_b", name: "Payments API" },
    ]);

    expect(lookup.byName("Payments API")).toEqual({
      kind: "project",
      id: "proj_b",
    });
  });

  it("ignores the whitespace a truncated row leaves around a name", () => {
    const lookup = projectLookup([{ id: "proj_a", name: "Storefront" }]);

    expect(lookup.byName("\n  Storefront ")).toEqual({
      kind: "project",
      id: "proj_a",
    });
  });

  it("gives up when two projects share a name", () => {
    const lookup = projectLookup([
      { id: "proj_a", name: "Storefront" },
      { id: "proj_b", name: "Storefront" },
    ]);

    expect(lookup.byName("Storefront")).toBeNull();
  });

  it("gives up on a name no project carries", () => {
    expect(projectLookup([]).byName("Storefront")).toBeNull();
  });

  it("gives up on the empty name a row renders before its data arrives", () => {
    const lookup = projectLookup([{ id: "proj_a", name: "" }]);

    expect(lookup.byName("")).toBeNull();
  });
});
