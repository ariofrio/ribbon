import { describe, expect, it } from "vitest";
import {
  resolveWorkflowReorder,
  type ReorderThreadLike,
} from "./workflow-reorder";
import type { ThreadAssignment } from "./workflow-stage";

function thread(
  id: string,
  overrides: Partial<ReorderThreadLike> = {},
): ReorderThreadLike {
  return {
    id,
    parentThreadId: null,
    visibility: "visible",
    archivedAt: null,
    pinnedAt: null,
    pinSortKey: null,
    createdAt: 1,
    ...overrides,
  };
}

function assignment(
  threadId: string,
  workflowStage: ThreadAssignment["workflowStage"],
  sortKey: string,
): ThreadAssignment {
  return { threadId, workflowStage, sortKey, updatedAt: 1 };
}

const threads = [thread("thr_a"), thread("thr_b"), thread("thr_c")];
const assignments = [
  assignment("thr_a", "Idle", "a"),
  assignment("thr_b", "Idle", "b"),
  assignment("thr_c", "Idle", "c"),
];

describe("resolveWorkflowReorder", () => {
  it("steps a task between its neighbors", () => {
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_c",
        workflowStage: "Idle",
        intent: { scope: "step", direction: -1 },
      }),
    ).toEqual({
      kind: "order",
      workflowStage: "Idle",
      previousThreadId: "thr_a",
      nextThreadId: "thr_b",
    });
  });

  it("sends a thread to the end of its stage", () => {
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_a",
        workflowStage: "Idle",
        intent: { scope: "edge", direction: 1 },
      }),
    ).toEqual({
      kind: "order",
      workflowStage: "Idle",
      previousThreadId: "thr_c",
      nextThreadId: null,
    });
  });

  it("does nothing at the edge a task already occupies", () => {
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_a",
        workflowStage: "Idle",
        intent: { scope: "step", direction: -1 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("steps to the neighboring stage and stops at the ends", () => {
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_b",
        workflowStage: "Idle",
        intent: { scope: "stage", direction: -1 },
      }),
    ).toEqual({ kind: "stage", workflowStage: "Deferred" });
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_b",
        workflowStage: "Deferred",
        intent: { scope: "stage", direction: -1 },
      }),
    ).toEqual({ kind: "none" });
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_b",
        workflowStage: "Completed",
        intent: { scope: "stage", direction: 1 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("skips disabled stages during cross-stage keyboard moves", () => {
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_b",
        workflowStage: "Idle",
        enabledStages: ["Idle", "Active", "Completed"],
        intent: { scope: "stage", direction: 1 },
      }),
    ).toEqual({ kind: "stage", workflowStage: "Active" });
    expect(
      resolveWorkflowReorder({
        threads,
        assignments,
        threadId: "thr_b",
        workflowStage: "Idle",
        enabledStages: ["Idle", "Active", "Completed"],
        intent: { scope: "stage", direction: -1 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("moves among rows at the task's own depth", () => {
    const nested = [
      thread("thr_a"),
      thread("thr_a1", { parentThreadId: "thr_a" }),
      thread("thr_b"),
      thread("thr_c"),
    ];
    const nestedAssignments = [
      assignment("thr_a", "Idle", "a"),
      assignment("thr_a1", "Idle", "b"),
      assignment("thr_b", "Idle", "c"),
      assignment("thr_c", "Idle", "d"),
    ];

    expect(
      resolveWorkflowReorder({
        threads: nested,
        assignments: nestedAssignments,
        threadId: "thr_b",
        workflowStage: "Idle",
        intent: { scope: "step", direction: -1 },
      }),
    ).toEqual({
      kind: "order",
      workflowStage: "Idle",
      previousThreadId: null,
      nextThreadId: "thr_a",
    });
    expect(
      resolveWorkflowReorder({
        threads: nested,
        assignments: nestedAssignments,
        threadId: "thr_a1",
        workflowStage: "Idle",
        intent: { scope: "step", direction: 1 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("does not reorder or change status for a child thread", () => {
    const nested = [
      thread("thr_parent"),
      thread("thr_child", { parentThreadId: "thr_parent" }),
    ];

    expect(
      resolveWorkflowReorder({
        threads: nested,
        assignments: [assignment("thr_parent", "Idle", "a")],
        threadId: "thr_child",
        workflowStage: "Idle",
        intent: { scope: "stage", direction: 1 },
      }),
    ).toEqual({ kind: "none" });
  });

  it("reorders a pinned thread among the pinned roots", () => {
    const pinned = [
      thread("thr_a", { pinnedAt: 3, pinSortKey: "a" }),
      thread("thr_b", { pinnedAt: 2, pinSortKey: "b" }),
      thread("thr_b1", { parentThreadId: "thr_b" }),
      thread("thr_c", { pinnedAt: 1, pinSortKey: "c" }),
    ];

    expect(
      resolveWorkflowReorder({
        threads: pinned,
        assignments,
        threadId: "thr_c",
        workflowStage: "Idle",
        intent: { scope: "edge", direction: -1 },
      }),
    ).toEqual({
      kind: "pinned",
      previousThreadId: null,
      nextThreadId: "thr_a",
    });
  });

  it("ignores archived, hidden, and unknown threads", () => {
    const mixed = [
      thread("thr_a"),
      thread("thr_hidden", { visibility: "hidden" }),
      thread("thr_archived", { archivedAt: 5 }),
      thread("thr_c"),
    ];
    const mixedAssignments = [
      assignment("thr_a", "Idle", "a"),
      assignment("thr_hidden", "Idle", "b"),
      assignment("thr_archived", "Idle", "c"),
      assignment("thr_c", "Idle", "d"),
    ];

    expect(
      resolveWorkflowReorder({
        threads: mixed,
        assignments: mixedAssignments,
        threadId: "thr_c",
        workflowStage: "Idle",
        intent: { scope: "step", direction: -1 },
      }),
    ).toEqual({
      kind: "order",
      workflowStage: "Idle",
      previousThreadId: null,
      nextThreadId: "thr_a",
    });
    expect(
      resolveWorkflowReorder({
        threads: mixed,
        assignments: mixedAssignments,
        threadId: "thr_missing",
        workflowStage: "Idle",
        intent: { scope: "step", direction: -1 },
      }),
    ).toEqual({ kind: "none" });
  });
});
