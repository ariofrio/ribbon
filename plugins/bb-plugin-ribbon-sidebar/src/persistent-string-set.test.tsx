// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePersistentStringSet } from "./persistent-string-set";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("persistent string sets", () => {
  it("preserves migrated collapse state after the host clears its legacy key", () => {
    localStorage.setItem("legacy", JSON.stringify(["parent"]));
    const first = renderHook(() => usePersistentStringSet("ribbon", "legacy"));
    expect([...first.result.current[0]]).toEqual(["parent"]);
    first.unmount();
    localStorage.removeItem("legacy");
    const second = renderHook(() => usePersistentStringSet("ribbon", "legacy"));
    expect([...second.result.current[0]]).toEqual(["parent"]);
    act(() => second.result.current[1](new Set()));
    second.unmount();
    localStorage.setItem("legacy", JSON.stringify(["parent"]));
    const third = renderHook(() => usePersistentStringSet("ribbon", "legacy"));
    expect([...third.result.current[0]]).toEqual([]);
  });
});
