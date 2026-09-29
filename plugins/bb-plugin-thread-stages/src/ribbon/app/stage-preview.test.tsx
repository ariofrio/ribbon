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
it("counts only hidden rows and keeps the selected root in the preview", () => {
  const view = render(
    <StagePreview
      rows={rows}
      stage="completed"
      selectedRootId="thread-7"
      renderRow={renderRow}
    />,
  );
  expect(view.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "thread-0",
    "thread-1",
    "thread-7",
  ]);
  expect(
    view.getByRole("button", { name: "Show 5 more completed" }),
  ).toBeTruthy();
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
  fireEvent.click(view.getByRole("button", { name: "Show 6 more deferred" }), {
    detail: 0,
  });
  expect(document.activeElement).toBe(
    view.getByRole("link", { name: "thread-2" }),
  );
  fireEvent.click(view.getByRole("button", { name: "Show fewer deferred" }));
  expect(document.activeElement).toBe(
    view.getByRole("button", { name: "Show 6 more deferred" }),
  );
  expect(view.getAllByRole("link")).toHaveLength(2);
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
