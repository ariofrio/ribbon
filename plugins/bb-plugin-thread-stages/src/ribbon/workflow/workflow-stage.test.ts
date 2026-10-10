import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  destinationOrder,
  enabledWorkflowStages,
  groupThreadsByStage,
  isBlockedStage,
  parseWorkflowStage,
  type ThreadAssignment,
} from "./workflow-stage";

describe("thread statuses", () => {
  it("keeps the supported stages stable and accepts friendly CLI spellings", () => {
    expect(WORKFLOW_STAGES).toEqual([
      "Deferred",
      "Active",
      "Waiting",
      "BlockedOnUser",
      "BlockedOnOtherAgent",
      "BlockedOnThirdParty",
      "Completed",
    ]);
    expect(parseWorkflowStage("backlog")).toBe("Deferred");
    expect(parseWorkflowStage("deferred")).toBe("Deferred");
    expect(parseWorkflowStage("active")).toBe("Active");
    expect(parseWorkflowStage("In progress")).toBe("Active");
    expect(parseWorkflowStage("in-progress")).toBe("Active");
    expect(parseWorkflowStage("Blocked on user")).toBe("BlockedOnUser");
    expect(parseWorkflowStage("to-do")).toBe("Active");
    // Idle and Blocked are earlier names, kept for saved data and old messages.
    expect(parseWorkflowStage("Idle")).toBe("Active");
    expect(parseWorkflowStage("Blocked")).toBe("BlockedOnThirdParty");
    expect(parseWorkflowStage("waiting")).toBe("Waiting");
    expect(parseWorkflowStage("Blocked on external party")).toBe("BlockedOnThirdParty");
    expect(parseWorkflowStage("Blocked on other agent")).toBe("BlockedOnOtherAgent");
    expect(parseWorkflowStage("Blocked on another thread")).toBe(
      "BlockedOnOtherAgent",
    );
    expect(parseWorkflowStage("blocked-on-third-party")).toBe(
      "BlockedOnThirdParty",
    );
    // Working is shown on the stage icon, not stored as a stage.
    expect(parseWorkflowStage("working")).toBeNull();
    expect(parseWorkflowStage("done")).toBe("Completed");
    expect(parseWorkflowStage("cancelled")).toBe("Completed");
    expect(parseWorkflowStage("not started")).toBeNull();
  });

  it("labels each stage for people", () => {
    expect(WORKFLOW_STAGES.map((stage) => WORKFLOW_STAGE_LABELS[stage])).toEqual([
      "Deferred",
      "In progress",
      "Waiting",
      "Blocked on user",
      "Blocked on another thread",
      "Blocked on external party",
      "Completed",
    ]);
  });

  it("keeps required stages while allowing Deferred and all Blocked stages to be hidden", () => {
    expect(
      enabledWorkflowStages({
        showDeferredStage: false,
        showBlockedStage: false,
      }),
    ).toEqual(["Active", "Waiting", "Completed"]);
    expect(enabledWorkflowStages(undefined)).toEqual(WORKFLOW_STAGES);
  });

  it("recognizes user blockers and groups them independently of Waiting", () => {
    expect(isBlockedStage("BlockedOnUser")).toBe(true);
    const groups = groupThreadsByStage([{ id: "review", updatedAt: 1 }], [{
      threadId: "review", workflowStage: "BlockedOnUser", sortKey: "U", updatedAt: 1,
    }]);
    expect(groups.BlockedOnUser.map(({ id }) => id)).toEqual(["review"]);
    expect(groups.Waiting).toEqual([]);
  });

  it("defaults unassigned threads to Active and honors explicit sort keys", () => {
    const threads = [
      { id: "unassigned", updatedAt: 30 },
      { id: "second", updatedAt: 20 },
      { id: "first", updatedAt: 10 },
      { id: "working", updatedAt: 5 },
    ];
    const assignments: ThreadAssignment[] = [
      { threadId: "second", workflowStage: "Active", sortKey: "k", updatedAt: 2 },
      { threadId: "first", workflowStage: "Active", sortKey: "U", updatedAt: 1 },
      {
        threadId: "working",
        workflowStage: "Waiting",
        sortKey: "U",
        updatedAt: 3,
      },
    ];

    const groups = groupThreadsByStage(threads, assignments);

    expect(groups.Active.map((thread) => thread.id)).toEqual([
      "first",
      "second",
      "unassigned",
    ]);
    expect(groups.Waiting.map((thread) => thread.id)).toEqual(["working"]);
    expect(groups.Completed).toEqual([]);
  });

  it("defaults assignments from an incompatible bundle to Active", () => {
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

    expect(groups.Active.map((thread) => thread.id)).toEqual(["newer-status"]);
  });

  it("groups each thread by its own workflow stage", () => {
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
        workflowStage: "Deferred",
        sortKey: "b",
        updatedAt: 2,
      },
      {
        threadId: "grandchild",
        workflowStage: "BlockedOnThirdParty",
        sortKey: "c",
        updatedAt: 3,
      },
      { threadId: "other", workflowStage: "Active", sortKey: "d", updatedAt: 4 },
    ];

    const groups = groupThreadsByStage(threads, assignments);

    expect(groups.Completed.map(({ id }) => id)).toEqual(["parent"]);
    expect(groups.Deferred.map(({ id }) => id)).toEqual(["child"]);
    expect(groups.BlockedOnThirdParty.map(({ id }) => id)).toEqual(["grandchild"]);
    expect(groups.Active.map(({ id }) => id)).toEqual(["other"]);
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
