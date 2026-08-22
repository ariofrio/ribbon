import { describe, expect, it } from "vitest";
import { projectFromPath } from "./route";

describe("projectFromPath", () => {
  it.each([
    ["/projects/proj_a", "the project's own compose screen"],
    ["/projects/proj_a/settings", "its settings"],
    ["/projects/proj_a/archived", "its archive"],
    ["/projects/proj_a/threads/thr_b", "a thread inside it"],
    ["/projects/proj_a/threads/thr_b/diff", "a thread's panel"],
  ])("reads the project out of %s — %s", (path) => {
    expect(projectFromPath(path)).toEqual({ kind: "project", id: "proj_a" });
  });

  it.each([
    ["/", "the root compose screen"],
    ["/threads/thr_b", "a personal thread, which belongs to no project path"],
    ["/settings/archived", "settings that span every project"],
    ["/projects", "the bare prefix"],
    ["/projects/", "the bare prefix with nothing after it"],
    ["/projectsomething/proj_a", "a path that only starts the same way"],
  ])("finds nothing in %s — %s", (path) => {
    expect(projectFromPath(path)).toBeNull();
  });

  it.each([
    ["/projects/proj_a", "the project's own screen"],
    ["/projects/proj_a/", "the same screen with a trailing slash"],
  ])("reads %s exactly — %s", (path) => {
    expect(projectFromPath(path, { exact: true })).toEqual({
      kind: "project",
      id: "proj_a",
    });
  });

  it.each([
    ["/projects/proj_a/settings", "a screen inside the project"],
    ["/projects/proj_a/threads/thr_b", "a thread inside it"],
  ])("declines %s when asked exactly — %s", (path) => {
    expect(projectFromPath(path, { exact: true })).toBeNull();
  });

  it("decodes an id the router escaped", () => {
    expect(projectFromPath("/projects/proj%5Fa")).toEqual({
      kind: "project",
      id: "proj_a",
    });
  });
});
