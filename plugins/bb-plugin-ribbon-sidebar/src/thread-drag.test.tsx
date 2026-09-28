// @vitest-environment jsdom
import { DndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { cleanup, render } from "@testing-library/react";
import { memo } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ThreadDragGroup } from "./thread-drag";

afterEach(cleanup);

it("keeps sortable rows stable when thread data changes without reordering", () => {
  const renders = vi.fn();
  const Row = memo(function Row() {
    const sortable = useSortable({ id: "a" });
    renders();
    return <div ref={sortable.setNodeRef}>Thread</div>;
  });
  const view = (ids: string[]) => (
    <DndContext>
      <ThreadDragGroup
        target={{ kind: "pinned", roots: ids.map((id) => ({ id })) }}
        disabled={false}
      >
        <Row />
      </ThreadDragGroup>
    </DndContext>
  );
  const rendered = render(view(["a", "b"]));
  const before = renders.mock.calls.length;
  rendered.rerender(view(["a", "b"]));
  expect(renders).toHaveBeenCalledTimes(before);
  rendered.rerender(view(["b", "a"]));
  expect(renders.mock.calls.length).toBeGreaterThan(before);
});
