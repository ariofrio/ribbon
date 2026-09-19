import { describe, expect, it } from "vitest";
import { reorderTargetId } from "./workflow-shortcuts";

describe("reorderTargetId", () => {
  const flat = ["thr_a", "thr_b", "thr_c"];

  it("steps a task past one neighbor", () => {
    expect(reorderTargetId(flat, flat, "thr_b", "step", -1)).toEqual({
      beforeThreadId: "thr_a",
    });
    expect(reorderTargetId(flat, flat, "thr_a", "step", 1)).toEqual({
      beforeThreadId: "thr_c",
    });
    expect(reorderTargetId(flat, flat, "thr_b", "step", 1)).toEqual({
      beforeThreadId: null,
    });
  });

  it("sends a task to the first or last position", () => {
    expect(reorderTargetId(flat, flat, "thr_c", "edge", -1)).toEqual({
      beforeThreadId: "thr_a",
    });
    expect(reorderTargetId(flat, flat, "thr_a", "edge", 1)).toEqual({
      beforeThreadId: null,
    });
  });

  it("keeps a task put at the edge it already occupies", () => {
    expect(reorderTargetId(flat, flat, "thr_a", "step", -1)).toBeNull();
    expect(reorderTargetId(flat, flat, "thr_a", "edge", -1)).toBeNull();
    expect(reorderTargetId(flat, flat, "thr_c", "step", 1)).toBeNull();
    expect(reorderTargetId(flat, flat, "thr_c", "edge", 1)).toBeNull();
    expect(reorderTargetId(flat, flat, "thr_missing", "step", 1)).toBeNull();
  });

  it("skips over a sibling's nested threads", () => {
    const ordered = ["thr_a", "thr_b", "thr_b1", "thr_c"];
    const siblings = ["thr_a", "thr_b", "thr_c"];

    expect(reorderTargetId(ordered, siblings, "thr_a", "step", 1)).toEqual({
      beforeThreadId: "thr_c",
    });
    expect(reorderTargetId(ordered, siblings, "thr_b", "step", 1)).toEqual({
      beforeThreadId: null,
    });
    expect(reorderTargetId(ordered, siblings, "thr_a", "edge", 1)).toEqual({
      beforeThreadId: null,
    });
  });

  it("places a task after a trailing sibling's nested threads", () => {
    const ordered = ["thr_a", "thr_b", "thr_c", "thr_c1"];
    const siblings = ["thr_a", "thr_b", "thr_c"];

    expect(reorderTargetId(ordered, siblings, "thr_a", "edge", 1)).toEqual({
      beforeThreadId: "thr_c1",
    });
  });
});
