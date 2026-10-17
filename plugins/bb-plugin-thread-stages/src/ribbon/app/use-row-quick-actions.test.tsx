// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { makeSidebarThread } from "../../app/model/fixtures.js";
const { resolve, run } = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn() }));
vi.mock("./row-actions.js", () => ({
  useRibbonThreadActions: (thread: unknown, options: unknown) =>
    resolve(thread, options),
}));
import { useRowQuickActions } from "./use-row-quick-actions.js";
const thread = makeSidebarThread({ id: "thread" });
function Row({
  keys,
  onRename = () => {},
}: {
  keys: string[];
  onRename?: () => void;
}) {
  const actions = useRowQuickActions(thread, keys, onRename);
  return (
    <>
      {actions.registration}
      {actions.entries.map((e) => (
        <button key={e.key} onClick={() => void e.action.run()}>
          {e.action.label}
        </button>
      ))}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("does not subscribe to host action data when no quick actions are configured", () => {
  resolve.mockReturnValue([]);
  render(<Row keys={[]} />);
  expect(resolve).not.toHaveBeenCalled();
});
it("resolves configured actions without remounting the row and drops hidden ones", () => {
  resolve.mockReturnValue([{ key: "key", action: { label: "Action", run } }]);
  const view = render(<Row keys={["key"]} />);
  fireEvent.click(screen.getByRole("button", { name: "Action" }));
  expect(run).toHaveBeenCalledOnce();
  view.rerender(<Row keys={[]} />);
  expect(screen.queryByRole("button")).toBeNull();
});
it("uses the latest rename handler without resubscribing on each row render", () => {
  const first = vi.fn(),
    second = vi.fn();
  resolve.mockImplementation((_t, options) => [
    { key: "key", action: { label: "Rename", run: options.requestRename } },
  ]);
  const view = render(<Row keys={["key"]} onRename={first} />);
  const calls = resolve.mock.calls.length;
  view.rerender(<Row keys={["key"]} onRename={second} />);
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  expect(second).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  expect(resolve.mock.calls.length).toBe(calls);
});
