import { describe, expect, it } from "vitest";
import { rowIcon } from "./row-icon";
import type { ProjectIconView } from "./icons";

const view = (name: string): ProjectIconView => ({
  name,
  glyph: [] as unknown as ProjectIconView["glyph"],
  color: null,
});

// `projects` carries a default for every project; the other two hold only what
// someone has actually picked.
const projects = new Map([
  ["proj_a", view("rocket")],
  ["proj_plain", view("folder-01")],
]);
const chosenProjects = new Map([["proj_a", view("rocket")]]);
const sections = new Map([["sec_a", view("bookmark")]]);

const owners = { projects, chosenProjects, sections };

describe("rowIcon", () => {
  it("prefers the project's own icon over its section's", () => {
    expect(
      rowIcon({ sectionId: "sec_a", projectId: "proj_a" }, owners)?.name,
    ).toBe("rocket");
  });

  it("falls through to the section when the project has none of its own", () => {
    expect(
      rowIcon({ sectionId: "sec_a", projectId: "proj_plain" }, owners)?.name,
    ).toBe("bookmark");
  });

  it("draws the project's default when neither was picked", () => {
    expect(
      rowIcon({ sectionId: "sec_none", projectId: "proj_plain" }, owners)?.name,
    ).toBe("folder-01");
  });

  it("draws the project's default for a thread in no section", () => {
    expect(
      rowIcon({ sectionId: null, projectId: "proj_plain" }, owners)?.name,
    ).toBe("folder-01");
  });

  it("draws nothing for a project it has never heard of", () => {
    expect(rowIcon({ sectionId: null, projectId: "proj_gone" }, owners)).toBeNull();
  });
});
