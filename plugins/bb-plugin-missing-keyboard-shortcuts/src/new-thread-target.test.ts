import { describe, expect, it } from "vitest";
import { projectThreadTarget } from "./new-thread-target";

describe("projectThreadTarget", () => {
  it("targets the selected thread's project", () => {
    expect(
      projectThreadTarget({ projectId: "proj_one", threadId: "thr_standard" }),
    ).toEqual({ projectId: "proj_one" });
    expect(
      projectThreadTarget({ projectId: null, threadId: "thr_personal" }),
    ).toEqual({ projectId: "proj_personal" });
  });

  it("targets the last selected thread's project when no thread is selected", () => {
    expect(
      projectThreadTarget(
        { projectId: null, threadId: null },
        "proj_last_selected",
      ),
    ).toEqual({ projectId: "proj_last_selected" });
  });

  it("falls back to no project before a thread has been selected", () => {
    expect(
      projectThreadTarget({ projectId: null, threadId: null }),
    ).toEqual({ projectId: "proj_personal" });
  });
});
