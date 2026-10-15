// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import { makeSidebarThread } from "../../app/model/fixtures";
import { NO_COLLAPSED_CHILD_ACTIVITY } from "../../app/model/thread-activity";
import type { ProjectThreadItem } from "../../app/model/project-thread-groups";
import { ribbonEnabledAtom, ribbonStagesAtom } from "./atoms";
import { SiblingLineage, useRowLineage } from "./rails";
import { StageBandedItems } from "./StageBandedItems";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  useSettings: () => ({ values: { stagePreviewRows: 2 } }),
}));
afterEach(cleanup);

function Lineage({ id }: { id: string }) {
  return <output aria-label={id}>{JSON.stringify(useRowLineage())}</output>;
}

function setup(stages: readonly string[], selectedThreadId?: string) {
  const store = createStore();
  store.set(ribbonEnabledAtom, true);
  store.set(ribbonStagesAtom, new Map(stages.map((groupId, index) => [String(index), {
    threadId: String(index), groupId, groupingKey: "plugin:thread-stages:stages", enteredAtMs: 1,
  }])));
  const items: ProjectThreadItem[] = stages.map((_, index) => ({
    kind: "thread",
    node: {
      thread: makeSidebarThread({ id: String(index) }),
      children: [], depth: 1, stats: { childCount: 0, childActivity: NO_COLLAPSED_CHILD_ACTIVITY },
    },
  }));
  const renderItem = (item: ProjectThreadItem, index: number, count: number) => {
    if (item.kind !== "thread") throw new Error("Expected a thread");
    const id = item.node.thread.id;
    return (
      <SiblingLineage key={id} index={index} count={count}>
        <Lineage id={id} />
        <SiblingLineage index={0} count={1}><Lineage id={`${id}-child`} /></SiblingLineage>
      </SiblingLineage>
    );
  };
  const view = render(
    <Provider store={store}>
      <StageBandedItems
        items={items}
        selectedThreadId={selectedThreadId}
        renderItem={renderItem}
        renderMain={(items) => items.map((item, index) => renderItem(item, index, items.length))}
      />
    </Provider>,
  );
  const lineage = (id: string) => JSON.parse(view.getByLabelText(id).textContent!);
  return { view, lineage };
}

it("keeps one sibling lineage across stage bands without leaking band boundaries into children", () => {
  const { lineage } = setup(["Active", "Deferred", "Completed"]);
  expect(lineage("0")).toEqual({ firstChild: true, lastAtDepth: [false] });
  expect(lineage("1")).toEqual({ firstChild: false, lastAtDepth: [false] });
  expect(lineage("2")).toEqual({ firstChild: false, lastAtDepth: [true] });
  expect(lineage("0-child")).toEqual({ firstChild: true, lastAtDepth: [false, true] });
});

it("terminates at the last visible sibling and updates when previews expand", () => {
  const { view, lineage } = setup(["Active", "Deferred", "Deferred", "Completed", "Completed"]);
  expect(lineage("1").lastAtDepth).toEqual([false]);
  expect(lineage("3").lastAtDepth).toEqual([true]);
  fireEvent.click(view.getByRole("button", { name: "Show 1 more completed" }), { detail: 1 });
  expect(lineage("3").lastAtDepth).toEqual([false]);
  expect(lineage("4").lastAtDepth).toEqual([true]);
});

it("accounts for empty bands and a selected sibling outside the preview", () => {
  const { lineage } = setup(["Deferred", "Deferred", "Completed", "Completed"], "3");
  expect(lineage("0")).toEqual({ firstChild: true, lastAtDepth: [false] });
  expect(lineage("3")).toEqual({ firstChild: false, lastAtDepth: [true] });
});
