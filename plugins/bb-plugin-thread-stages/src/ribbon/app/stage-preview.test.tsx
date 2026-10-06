// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StagePreview } from "./stage-preview";
afterEach(cleanup);
const rows = Array.from({ length: 8 }, (_, index) => ({
  id: `thread-${index}`,
}));
const renderRow = (row: { id: string }) => (
  <li key={row.id} data-thread-id={row.id}>
    <a href={`#${row.id}`}>{row.id}</a>
  </li>
);
it("counts only hidden rows and keeps the selected root within the preview budget", () => {
  const view = render(
    <StagePreview
      rows={rows}
      stage="completed"
      selectedRootId="thread-7"
      renderRow={renderRow}
    />,
  );
  expect(view.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "thread-7",
  ]);
  expect(
    view.getByRole("button", { name: "Show 7 more completed" }),
  ).toBeTruthy();
});
it.each([
  [1, 1, 1, 0],
  [1, 2, 0, 2],
  [2, 1, 1, 0],
  [2, 2, 1, 1],
  [3, 1, 1, 0],
  [3, 2, 2, 0],
  [3, 3, 2, 1],
  [4, 3, 3, 0],
  [4, 4, 3, 1],
  [5, 4, 4, 0],
  [5, 5, 4, 1],
  [5, 8, 4, 4],
])("limits a %i-row preview of %i threads to %i threads with %i hidden", (rowLimit, count, shown, hidden) => {
  const view = render(
    <StagePreview
      rows={rows.slice(0, count)}
      stage="completed"
      selectedRootId={rows[count - 1]?.id ?? null}
      renderRow={renderRow}
      rowLimit={rowLimit}
    />,
  );
  expect(view.queryAllByRole("link")).toHaveLength(shown);
  if (hidden > 0)
    expect(view.getByRole("button", { name: `Show ${hidden} more completed` })).toBeTruthy();
  else expect(view.queryByRole("button")).toBeNull();
});
it("keyboard expansion enters the revealed rows and shortening returns focus to the control", () => {
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  Element.prototype.scrollIntoView = vi.fn();
  const view = render(
    <StagePreview
      rows={rows}
      stage="deferred"
      selectedRootId={null}
      renderRow={renderRow}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Show 7 more deferred" }), {
    detail: 0,
  });
  expect(document.activeElement).toBe(
    view.getByRole("link", { name: "thread-1" }),
  );
  fireEvent.click(view.getByRole("button", { name: "Show fewer deferred" }));
  expect(document.activeElement).toBe(
    view.getByRole("button", { name: "Show 7 more deferred" }),
  );
  expect(view.getAllByRole("link")).toHaveLength(1);
  vi.unstubAllGlobals();
});
it("search reveals every matching result without an overflow control", () => {
  const view = render(
    <StagePreview
      rows={rows}
      stage="completed"
      selectedRootId={null}
      renderRow={renderRow}
      revealAll
    />,
  );
  expect(view.getAllByRole("link")).toHaveLength(8);
  expect(view.queryByRole("button")).toBeNull();
});
