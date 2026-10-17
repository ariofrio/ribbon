// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
const { register, down, dispose } = vi.hoisted(() => ({
  register: vi.fn(),
  down: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("@get-bb/plugin-sdk/app", () => ({
  experimental_useSidebarThreadSplit: (id: string) => {
    register(id);
    useEffect(() => () => dispose(id), [id]);
    return {
      isAvailable: true,
      layout: null,
      splitProps: { onPointerDown: down },
    };
  },
}));
import { useDeferredSidebarThreadSplit } from "./useDeferredSidebarThreadSplit.js";
function Row({ id }: { id: string }) {
  const split = useDeferredSidebarThreadSplit(id);
  return (
    <div
      onPointerDown={split.onPointerDown}
      onFocusCapture={split.onFocusCapture}
      onBlurCapture={split.onBlurCapture}
    >
      <a href={"#" + id}>{id}</a>
      {split.behavior}
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not register split behavior for rows that receive no input", () => {
  render(
    <>
      {Array.from({ length: 120 }, (_, i) => (
        <Row key={i} id={"thread-" + i} />
      ))}
    </>,
  );
  expect(register).not.toHaveBeenCalled();
});
it("delivers the first pointer event to the host without replacing its target", async () => {
  render(<Row id="thread" />);
  const anchor = screen.getByRole("link");
  fireEvent.pointerDown(anchor, {
    button: 0,
    pointerId: 1,
    pointerType: "touch",
  });
  expect(register).toHaveBeenCalledWith("thread");
  expect(down).toHaveBeenCalledOnce();
  expect(screen.getByRole("link")).toBe(anchor);
  expect(anchor.isConnected).toBe(true);
  fireEvent.pointerUp(document, { pointerId: 1 });
  await waitFor(() => expect(dispose).toHaveBeenCalledWith("thread"));
});
it("keeps behavior alive throughout a gesture and releases it after focus leaves", async () => {
  render(<Row id="thread" />);
  const anchor = screen.getByRole("link");
  act(() => anchor.focus());
  expect(register).toHaveBeenCalledWith("thread");
  fireEvent.pointerDown(anchor, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(document, { pointerId: 1 });
  await act(async () => {});
  expect(dispose).not.toHaveBeenCalled();
  act(() => anchor.blur());
  await waitFor(() => expect(dispose).toHaveBeenCalledWith("thread"));
  expect(screen.getByRole("link")).toBe(anchor);
});

it("releases gesture behavior when a control stops pointerup propagation", async () => {
  render(<Row id="thread" />);
  const anchor = screen.getByRole("link");
  anchor.addEventListener("pointerup", event => event.stopPropagation());
  fireEvent.pointerDown(anchor, { button: 0, pointerId: 1 });
  expect(register).toHaveBeenCalledWith("thread");
  fireEvent.pointerUp(anchor, { pointerId: 1 });
  await waitFor(() => expect(dispose).toHaveBeenCalledWith("thread"));
});

it("releases an unfocused gesture when the window loses focus", async () => {
  render(<Row id="thread" />);
  fireEvent.pointerDown(screen.getByRole("link"), { button: 0, pointerId: 1 });
  fireEvent.blur(window);
  await waitFor(() => expect(dispose).toHaveBeenCalledWith("thread"));
});
