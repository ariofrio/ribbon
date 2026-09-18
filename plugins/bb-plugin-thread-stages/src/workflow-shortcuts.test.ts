import { describe, expect, it } from "vitest";
import {
  reorderTargetId,
  workflowReorderShortcut,
  workflowStageShortcut,
} from "./workflow-shortcuts";

const baseChord = {
  altKey: false,
  code: "Period",
  ctrlKey: false,
  key: ".",
  metaKey: true,
  repeat: false,
  shiftKey: false,
};

describe("workflowStageShortcut", () => {
  it("maps each period chord to its workflow stage", () => {
    expect(workflowStageShortcut(baseChord)).toBe("Completed");
    expect(workflowStageShortcut({ ...baseChord, shiftKey: true })).toBe("Idle");
    expect(
      workflowStageShortcut({ ...baseChord, ctrlKey: true, shiftKey: true }),
    ).toBe("Blocked");
    expect(workflowStageShortcut({ ...baseChord, ctrlKey: true })).toBe("Deferred");
    expect(workflowStageShortcut({ ...baseChord, altKey: true })).toBe(
      "Completed",
    );
  });

  it("matches the period key when modifiers change its character", () => {
    expect(
      workflowStageShortcut({ ...baseChord, key: ">", shiftKey: true }),
    ).toBe("Idle");
    expect(workflowStageShortcut({ ...baseChord, altKey: true, key: "≥" })).toBe(
      "Completed",
    );
  });

  it("leaves Active to the automatic workflow", () => {
    const statuses = [
      workflowStageShortcut(baseChord),
      workflowStageShortcut({ ...baseChord, shiftKey: true }),
      workflowStageShortcut({ ...baseChord, ctrlKey: true, shiftKey: true }),
      workflowStageShortcut({ ...baseChord, ctrlKey: true }),
      workflowStageShortcut({ ...baseChord, altKey: true }),
    ];

    expect(statuses).not.toContain("Active");
  });

  it("rejects unassigned modifier combinations", () => {
    expect(
      workflowStageShortcut({ ...baseChord, altKey: true, shiftKey: true }),
    ).toBeNull();
    expect(
      workflowStageShortcut({ ...baseChord, altKey: true, ctrlKey: true }),
    ).toBeNull();
  });

  it("does not claim shortcuts for disabled stages", () => {
    const enabledStages = ["Idle", "Active", "Completed"] as const;
    expect(
      workflowStageShortcut(
        { ...baseChord, ctrlKey: true },
        enabledStages,
      ),
    ).toBeNull();
    expect(
      workflowStageShortcut(
        { ...baseChord, ctrlKey: true, shiftKey: true },
        enabledStages,
      ),
    ).toBeNull();
  });

  it("rejects other chords and held-key repeats", () => {
    expect(workflowStageShortcut({ ...baseChord, metaKey: false })).toBeNull();
    expect(
      workflowStageShortcut({ ...baseChord, code: "Comma", key: "," }),
    ).toBeNull();
    expect(workflowStageShortcut({ ...baseChord, repeat: true })).toBeNull();
  });
});

describe("workflowReorderShortcut", () => {
  const arrowChord = { ...baseChord, key: "ArrowDown" };

  it("maps arrow chords to their reorder intent", () => {
    expect(workflowReorderShortcut({ ...arrowChord, altKey: true })).toEqual({
      scope: "step",
      direction: 1,
    });
    expect(
      workflowReorderShortcut({ ...arrowChord, key: "ArrowUp", altKey: true }),
    ).toEqual({ scope: "step", direction: -1 });
    expect(
      workflowReorderShortcut({ ...arrowChord, altKey: true, shiftKey: true }),
    ).toEqual({ scope: "edge", direction: 1 });
    expect(
      workflowReorderShortcut({
        ...arrowChord,
        key: "ArrowUp",
        altKey: true,
        shiftKey: true,
      }),
    ).toEqual({ scope: "edge", direction: -1 });
    expect(workflowReorderShortcut({ ...arrowChord, ctrlKey: true })).toEqual({
      scope: "stage",
      direction: 1,
    });
    expect(
      workflowReorderShortcut({ ...arrowChord, key: "ArrowUp", ctrlKey: true }),
    ).toEqual({ scope: "stage", direction: -1 });
  });

  it("rejects unassigned combinations, other keys, and repeats", () => {
    expect(workflowReorderShortcut(arrowChord)).toBeNull();
    expect(
      workflowReorderShortcut({ ...arrowChord, altKey: true, ctrlKey: true }),
    ).toBeNull();
    expect(
      workflowReorderShortcut({ ...arrowChord, ctrlKey: true, shiftKey: true }),
    ).toBeNull();
    expect(
      workflowReorderShortcut({ ...arrowChord, altKey: true, metaKey: false }),
    ).toBeNull();
    expect(
      workflowReorderShortcut({ ...arrowChord, altKey: true, key: "ArrowLeft" }),
    ).toBeNull();
    expect(
      workflowReorderShortcut({ ...arrowChord, altKey: true, repeat: true }),
    ).toBeNull();
  });
});

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
