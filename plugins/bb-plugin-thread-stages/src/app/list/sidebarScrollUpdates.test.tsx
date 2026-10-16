// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  refreshSidebarScrollWindows,
  subscribeSidebarScroll,
} from "./sidebarScrollUpdates.js";
afterEach(cleanup);
it("commits nested windows together without an intermediate parent/child layout", () => {
  const element = document.createElement("div"),
    commits: string[][] = [];
  const record = () => {
    commits.push([
      document.querySelector("strong")!.textContent!,
      document.querySelector("em")!.textContent!,
    ]);
  };
  function Child() {
    const [v, set] = useState(0);
    useLayoutEffect(
      () => subscribeSidebarScroll(element, () => set((n) => n + 1)),
      [],
    );
    useLayoutEffect(record, [v]);
    return <em>{v}</em>;
  }
  function Parent() {
    const [v, set] = useState(0);
    useLayoutEffect(
      () => subscribeSidebarScroll(element, () => set((n) => n + 1)),
      [],
    );
    useLayoutEffect(record, [v]);
    return (
      <>
        <strong>{v}</strong>
        <Child />
      </>
    );
  }
  const add = vi.spyOn(element, "addEventListener"),
    remove = vi.spyOn(element, "removeEventListener");
  const view = render(<Parent />);
  commits.length = 0;
  act(() => element.dispatchEvent(new Event("scroll")));
  expect(commits.length).toBeGreaterThan(0);
  expect(commits.every(([a, b]) => a === "1" && b === "1")).toBe(true);
  expect(add).toHaveBeenCalledOnce();
  view.unmount();
  expect(remove).toHaveBeenCalledOnce();
  const count = commits.length;
  act(() => element.dispatchEvent(new Event("scroll")));
  expect(commits).toHaveLength(count);
});

it("settles a child window after an ancestor changes layout without another scroll event", () => {
  const element = document.createElement("div");
  let requested = 0;
  function Child() {
    const [v, set] = useState(0);
    useLayoutEffect(
      () =>
        subscribeSidebarScroll(element, () =>
          set(Number(document.querySelector("strong")!.textContent)),
        ),
      [],
    );
    return <em>{v}</em>;
  }
  function Parent() {
    const [v, set] = useState(0);
    useLayoutEffect(
      () => subscribeSidebarScroll(element, () => set(requested)),
      [],
    );
    useLayoutEffect(() => refreshSidebarScrollWindows(element), [v]);
    return (
      <>
        <strong>{v}</strong>
        <Child />
      </>
    );
  }
  render(<Parent />);
  requested = 1;
  act(() => element.dispatchEvent(new Event("scroll")));
  expect(document.querySelector("strong")!.textContent).toBe("1");
  expect(document.querySelector("em")!.textContent).toBe("1");
});
