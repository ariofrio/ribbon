import { describe, expect, it } from "vitest";
import { threadIconOwner } from "./thread-owner";

const stored = [
  { kind: "section" as const, id: "sec_a" },
  { kind: "project" as const, id: "proj_a" },
];

describe("threadIconOwner", () => {
  it("is the project once that project has an icon of its own", () => {
    expect(
      threadIconOwner({ sectionId: "sec_a", projectId: "proj_a" }, stored),
    ).toEqual({ kind: "project", id: "proj_a" });
  });

  it("falls through to the section while the project has none", () => {
    expect(
      threadIconOwner({ sectionId: "sec_a", projectId: "proj_none" }, stored),
    ).toEqual({ kind: "section", id: "sec_a" });
  });

  it("is the project when neither has one, so the default is the project's", () => {
    expect(
      threadIconOwner({ sectionId: "sec_none", projectId: "proj_none" }, stored),
    ).toEqual({ kind: "project", id: "proj_none" });
  });

  it("is the project for a thread in no section", () => {
    expect(
      threadIconOwner({ sectionId: null, projectId: "proj_none" }, stored),
    ).toEqual({ kind: "project", id: "proj_none" });
  });

  it("does not mistake a section's icon for a project's", () => {
    expect(
      threadIconOwner({ sectionId: null, projectId: "sec_a" }, stored),
    ).toEqual({ kind: "project", id: "sec_a" });
  });
});
