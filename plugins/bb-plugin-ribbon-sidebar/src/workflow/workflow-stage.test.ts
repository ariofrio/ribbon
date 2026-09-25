import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STAGES,
  destinationOrder,
  enabledWorkflowStages,
  groupThreadsByStage,
  parseWorkflowStage,
  type ThreadAssignment,
} from "./workflow-stage";

describe("thread statuses", () => {
  it("keeps the supported labels stable and accepts friendly CLI spellings", () => {
    expect(WORKFLOW_STAGES).toEqual([
      "Deferred",
      "Idle",
      "Active",
      "Blocked",
      "Completed",
    ]);
    expect(parseWorkflowStage("backlog")).toBe("Deferred");
    expect(parseWorkflowStage("deferred")).toBe("Deferred");
    expect(parseWorkflowStage("waiting")).toBe("Blocked");
    expect(parseWorkflowStage("to-do")).toBe("Idle");
    expect(parseWorkflowStage("working")).toBe("Active");
    expect(parseWorkflowStage("done")).toBe("Completed");
    expect(parseWorkflowStage("cancelled")).toBe("Completed");
    expect(parseWorkflowStage("not started")).toBeNull();
  });

  it("keeps required stages while allowing Deferred and Blocked to be hidden", () => {
    expect(
      enabledWorkflowStages({
        showDeferredStage: false,
        showBlockedStage: false,
      }),
    ).toEqual(["Idle", "Active", "Completed"]);
    expect(enabledWorkflowStages(undefined)).toEqual(WORKFLOW_STAGES);
  });

  it("defaults unassigned threads to Idle and honors explicit sort keys", () => {
    const threads = [
      { id: "unassigned", updatedAt: 30 },
      { id: "second", updatedAt: 20 },
      { id: "first", updatedAt: 10 },
      { id: "working", updatedAt: 5 },
    ];
    const assignments: ThreadAssignment[] = [
      { threadId: "second", workflowStage: "Idle", sortKey: "k", updatedAt: 2 },
      { threadId: "first", workflowStage: "Idle", sortKey: "U", updatedAt: 1 },
      {
        threadId: "working",
        workflowStage: "Active",
        sortKey: "U",
        updatedAt: 3,
      },
    ];

    const groups = groupThreadsByStage(threads, assignments);

    expect(groups["Idle"].map((thread) => thread.id)).toEqual([
      "first",
      "second",
      "unassigned",
    ]);
    expect(groups.Active.map((thread) => thread.id)).toEqual(["working"]);
    expect(groups.Completed).toEqual([]);
  });

  it("defaults assignments from an incompatible bundle to Idle", () => {
    const assignments = [
      {
        threadId: "newer-status",
        workflowStage: "Review",
        sortKey: "U",
        updatedAt: 1,
      },
    ] as unknown as ThreadAssignment[];

    const groups = groupThreadsByStage(
      [{ id: "newer-status", updatedAt: 1 }],
      assignments,
    );

    expect(groups["Idle"].map((thread) => thread.id)).toEqual(["newer-status"]);
  });

  it("groups every descendant under its root workflow stage", () => {
    const threads = [
      { id: "child", parentThreadId: "parent", updatedAt: 4 },
      { id: "other", parentThreadId: null, updatedAt: 3 },
      { id: "grandchild", parentThreadId: "child", updatedAt: 2 },
      { id: "parent", parentThreadId: null, updatedAt: 1 },
    ];
    const assignments: ThreadAssignment[] = [
      {
        threadId: "parent",
        workflowStage: "Completed",
        sortKey: "a",
        updatedAt: 1,
      },
      {
        threadId: "child",
        workflowStage: "Active",
        sortKey: "b",
        updatedAt: 2,
      },
      {
        threadId: "grandchild",
        workflowStage: "Blocked",
        sortKey: "c",
        updatedAt: 3,
      },
      { threadId: "other", workflowStage: "Idle", sortKey: "d", updatedAt: 4 },
    ];

    const groups = groupThreadsByStage(threads, assignments);

    expect(groups.Completed.map(({ id }) => id)).toEqual([
      "child",
      "grandchild",
      "parent",
    ]);
    expect(groups.Active).toEqual([]);
    expect(groups.Blocked).toEqual([]);
    expect(groups["Idle"].map(({ id }) => id)).toEqual(["other"]);
  });

  it("computes reorder and cross-group destination orders", () => {
    expect(destinationOrder(["a", "b", "c"], "c", "a")).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(destinationOrder(["a", "b"], "new", null)).toEqual([
      "a",
      "b",
      "new",
    ]);
    expect(destinationOrder(["a", "b", "c"], "b", "c")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("preserves the order when a task is dropped onto its current position", () => {
    expect(destinationOrder(["a", "b", "c"], "b", "b")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
