import { describe, expect, it } from "vitest";
import { createStore } from "jotai";
import { makeSidebarEnvironment, makeSidebarThread } from "../../app/model/fixtures.js";
import {
  buildProjectThreadGroups,
  buildSectionThreadList,
  getProjectThreadItemDescendants,
  getSidebarDndItemId,
  type ProjectThreadItem,
} from "../../app/model/project-thread-groups.js";
import type { WorkflowStage } from "../workflow/workflow-stage";
import { bandOf, stageBands } from "./bands";
import { ribbonEnabledAtom, ribbonRootEnvironmentGroupKeyAtom, ribbonStagesAtom } from "./atoms";
import { THREAD_STAGES_GROUPING_KEY } from "../workflow/catalog";
import { collectSectionThreadDndLookup, resolveSectionThreadDropDecision } from "../../app/dnd/useSectionThreadDnd.js";

const environment = makeSidebarEnvironment({ id: "shared", isWorktree: true });
const stages = new Map<string, WorkflowStage>([
  ["active", "Active"], ["waiting", "Waiting"],
  ["deferred-a", "Deferred"], ["deferred-b", "Deferred"],
  ["completed-a", "Completed"], ["completed-b", "Completed"],
]);
const stageOf = (id: string) => stages.get(id);
const groupKey = (thread: { id: string }) => bandOf(stageOf(thread.id));
const threads = [...stages.keys()].map((id, createdAt) =>
  makeSidebarThread({ id, createdAt, environment, sectionId: "work" }),
);
const ids = (items: readonly ProjectThreadItem[]) =>
  getProjectThreadItemDescendants(items).map((thread) => thread.id);

describe("environment groups within stage bands", () => {
  it.each([1, -1])("keeps every root in its own band with sort direction %s", (direction) => {
    const compare = (a: { createdAt: number }, b: { createdAt: number }) =>
      direction * (a.createdAt - b.createdAt);
    const items = buildProjectThreadGroups(threads, compare, true, groupKey);
    const bands = stageBands(items, stageOf);
    for (const [band, members] of Object.entries(bands)) {
      expect(members).toHaveLength(1);
      expect(members[0].kind).toBe("environment");
      expect(ids(members).every((id) => bandOf(stageOf(id)) === band)).toBe(true);
    }
    expect(new Set(ids(items))).toEqual(new Set(stages.keys()));
  });

  it("leaves a singleton in each band as an ordinary thread", () => {
    const items = buildProjectThreadGroups(
      [threads[0], threads[2], threads[4]], undefined, true, groupKey,
    );
    expect(items.every((item) => item.kind === "thread")).toBe(true);
    const bands = stageBands(items, stageOf);
    expect(ids(bands.main)).toEqual(["active"]);
    expect(ids(bands.deferred)).toEqual(["deferred-a"]);
    expect(ids(bands.completed)).toEqual(["completed-a"]);
  });

  it("respects custom sections as well as stage bands", () => {
    const items = buildSectionThreadList(
      [...threads, ...threads.map((thread) => ({
        ...thread, id: `${thread.id}-later`, sectionId: "later",
      }))],
      undefined,
      [{ id: "work", name: "Work" }, { id: "later", name: "Later" }],
      true,
      (thread) => bandOf(stageOf(thread.id.replace(/-later$/, ""))),
    );
    expect(items).toHaveLength(2);
    for (const item of items) {
      if (item.kind !== "section") throw new Error("Expected a section");
      expect(item.group.items).toHaveLength(3);
      expect(getProjectThreadItemDescendants(item.group.items).every(
        (thread) => thread.sectionId === item.group.id,
      )).toBe(true);
    }
  });

  it("keeps children together regardless of their individual stages", () => {
    const parent = makeSidebarThread({ id: "parent" });
    const children = [threads[0], threads[4]].map((thread) => ({
      ...thread, parentThreadId: parent.id,
    }));
    const items = buildProjectThreadGroups([parent, ...children], undefined, true, groupKey);
    expect(items).toHaveLength(1);
    if (items[0].kind !== "thread") throw new Error("Expected the parent");
    expect(items[0].node.children).toHaveLength(1);
    expect(items[0].node.children[0].kind).toBe("environment");
  });

  it("moves only the roots represented by the dragged band-specific header", () => {
    const items = buildSectionThreadList(
      threads, undefined,
      [{ id: "work", name: "Work" }, { id: "destination", name: "Destination" }],
      true, groupKey,
    );
    const lookup = collectSectionThreadDndLookup(items, "chronological");
    if (items[0].kind !== "section") throw new Error("Expected a section");
    const groups = items[0].group.items;
    expect(new Set(groups.map(getSidebarDndItemId)).size).toBe(3);
    for (const group of groups) {
      const activeId = getSidebarDndItemId(group);
      const decision = resolveSectionThreadDropDecision(lookup, activeId, "chronological::destination");
      expect(decision?.kind).toBe("move");
      if (decision?.kind !== "move") throw new Error("Expected a section move");
      expect(new Set(decision.threadIds)).toEqual(new Set(ids([group])));
    }
  });

  it("regroups roots when a stage changes and preserves upstream grouping outside Ribbon", () => {
    const store = createStore();
    expect(store.get(ribbonRootEnvironmentGroupKeyAtom)).toBeUndefined();
    store.set(ribbonEnabledAtom, true);
    const items = () => buildProjectThreadGroups(
      [threads[0], threads[1]], undefined, true, store.get(ribbonRootEnvironmentGroupKeyAtom),
    );
    expect(items()).toHaveLength(1);
    store.set(ribbonStagesAtom, new Map([["waiting", {
      groupingKey: THREAD_STAGES_GROUPING_KEY,
      threadId: "waiting", groupId: "Completed", enteredAtMs: null,
    }]]));
    expect(items()).toHaveLength(2);
    expect(items().every((item) => item.kind === "thread")).toBe(true);
    store.set(ribbonEnabledAtom, false);
    expect(items()).toHaveLength(1);
  });

  it("rebuilds each group's activity and count from its own members", () => {
    const items = buildProjectThreadGroups(threads.map((thread) => ({
      ...thread, hasPendingInteraction: thread.id === "active",
    })), undefined, true, groupKey);
    for (const item of items) {
      if (item.kind !== "environment") throw new Error("Expected a group");
      expect(item.group.stats.childCount).toBe(2);
      expect(new Set(item.group.stats.childActivity.threadIds)).toEqual(new Set(ids([item])));
      expect(item.group.stats.childActivity.pending).toBe(ids([item]).includes("active"));
    }
  });
});
